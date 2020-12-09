const fetch = require('node-fetch')
const config = require('config')
const md5 = require('md5')

const {url, siteId} = config.get('Kontramarka')
const {sign, sell_sign_arg, uncheckplacesUrl} = config.get('Tachcard')
const {timeoutSelectPlaces, timeoutReservePlaces} = config.get('Timers')
const {timers: DBTimers} = require('./models/timers')

const timersMap = new Map()

const sliceStr = (str, parts) => {
    let start = 0
    return parts.map((index, i, arr) => {
        start += i === 0 ? 0 : arr[i - 1]
        return str.slice(start, index + start)
    })
}

const lockMethodResult = async (obj, method, args) => {
    const result = await obj[method](...args)
    const modifyObj = obj.__proto__.hasOwnProperty(method) ? obj.__proto__ : (obj.hasOwnProperty(method) ? obj : null)
    if (!modifyObj)
        return f => f
    const oldMethod = modifyObj[method]
    modifyObj[method] = () => result
    return () => modifyObj[method] = oldMethod
}

const setPropertyIfNotExist = async (obj, property, value, fromFunctionResult = false) => {
    if (!obj.hasOwnProperty(property))
        obj[property] = (fromFunctionResult && typeof value === 'function') ? await value() : value
    return obj[property]
}

const getStatus_place = status => {
    switch (status) {
        case 0:
            return 1 //свободно
        case 1:
            return 2 //в корзине
        case 2:
            return 4 //продано
        case 3:
            return 3 //забронировано
    }
}

const fetchGet = async (method, args) => {
    const urlFull = `${url}/${method}/?${Object.entries(args).map(([key, value]) => `${key}=${value}`).join('&')}`
    console.log('fetchGet:', urlFull)
    return await fetch(
        urlFull,
        {
            method: 'GET',
            headers: {'Content-Type': 'application/json'}
        }
    )
        .then(async res => {
            if (res.status !== 200)
                throw await res.json()
            return res
        })
        .then(res => res.json())
}

const setTimerUnlock = async (tkSession, sessionid, timeout, _id) => {
    const handlerTimer = async () => {
        const basketList = await fetchGet('basket-list', {sessionid})
        let allDone = true
        const {theater} = config.get('useFinExpert')
        let places = []
        for (const item of basketList.items) {
            const {eventId, sectorId, placeId, rowNumber, placeNumber} = item
            const unlockResult = await fetchGet('unlock', {sessionid, siteId, eventId, sectorId, placeId})
            if (unlockResult.code !== 0)
                allDone = false
            else
                places.push({
                    theater,
                    code: eventId,
                    row: Number.parseInt(rowNumber),
                    place: Number.parseInt(placeNumber),
                    status_place: 1,
                    session: tkSession
                })
            // console.log({unlockResult})
        }
        console.log(`Timer ${tkSession}:${sessionid} done`)
        if (allDone)
            await DBTimers.deleteOne({_id})
        else {
            // якщо не вдалося розблокувати всі місця, повторити через деякий час
            const dateTimeout = new Date(Date.now() + 60000)
            await DBTimers.findOneAndUpdate({_id}, {timeout: dateTimeout})
        }
        const {eventIdToCode} = global
        places = places.map(place => ({...place, code: eventIdToCode(place.code)}))
        // console.log('fetch:', uncheckplacesUrl, {places, sign})
        const responseUncheck = await fetch(
            uncheckplacesUrl,
            {
                method: 'POST',
                body: {
                    places,
                    sign
                },
                headers: {'Content-Type': 'application/json'}
            })
        // console.log({responseUncheck})
    }
    if (timeout <= 0)
        await handlerTimer()
    else {
        const newTimerId = setTimeout(handlerTimer, timeout)
        const timerId = timersMap.get(sessionid)
        if (timerId)
            clearTimeout(timerId)
        timersMap.set(sessionid, newTimerId)
    }
}

const createTimerUnlock = async (tkSession, sessionid, timeout) => {
    const dateTimeout = new Date(Date.now() + timeout)
    let dbTimer = await DBTimers.findOneAndUpdate({tkSession, sessionid}, {timeout: dateTimeout})
    if (!dbTimer) {
        dbTimer = new DBTimers({tkSession, sessionid, timeout: dateTimeout})
        await dbTimer.save()
    }
    await setTimerUnlock(tkSession, sessionid, timeout, dbTimer._id)
}

const loadTimersUnlock = async () => {
    const timers = await DBTimers.find({})
    for (let {_id, tkSession, sessionid, timeout} of timers) {
        timeout = timeout - Date.now()
        await setTimerUnlock(tkSession, sessionid, timeout, _id)
    }
}

const createTakeStatus = (user, code) => {
    let allPlaces
    return async (place, row) => {
        // console.log('takeStatus:', code, row, place, `places was taked: ${allPlaces ? 'true' : 'false'}`)
        if (!allPlaces)
            allPlaces = await takeallplacesshedules(user, code, false)
        if (place && row) {
            const curPlace = allPlaces.places.find(plc => plc.place == place && plc.row == row) || {}
            return curPlace.status_place
        }
    }
}

const lockPlace = async (user, eventId, placeId, sectorId, place, row, isLock = true) => {
    const method = isLock ? 'lock' : 'unlock'
    const sessionid = await user.getSessionId(eventId)
    const result = await fetchGet(method, {sessionid, siteId, eventId, sectorId, placeId})
    await user.updateLastUse(sessionid)
    // console.log({...result})
    const {code: responseCode, items} = result
    const response = {
        status: false,
        sign,
        session: user.tkSession,
        code: eventId,
        place,
        row,
        status_place: 0,
        status_update: false,
        items
    }
    if (responseCode === 0) {
        if (!isLock)
            return {...response, status: true, status_update: true, status_place: 1}
        const curItem = items.find(item => item.placeId === placeId)
        if (curItem) {
            await createTimerUnlock(user.tkSession, sessionid, timeoutSelectPlaces)
            return {...response, status: true, status_update: true, status_place: 2}
        } else {
            return {...response, status: false, status_update: false}
        }
    } else {
        let status_place
        if (responseCode === 17) // 17 - Указанное место уже находится в корзине
            status_place = 2
        else {
            const takeStatus = await setPropertyIfNotExist(user, 'takeStatus', () => createTakeStatus(user, eventId), true)
            status_place = await takeStatus(place, row)
        }
        return {...response, status: false, status_update: false, status_place}
    }
}

const getBasketList = async (sessionid) => {
    const result = await fetchGet('basket-list', {sessionid})
    const {code: responseCode, items} = result
    if (responseCode === 0) {
        return items.map(({eventId, rowNumber, placeNumber, placeId, sectorId, price}) => ({
            eventId,
            placeId,
            sectorId,
            rowNumber: Number.parseInt(rowNumber),
            placeNumber: Number.parseInt(placeNumber),
            price: price / 100
        }))
    }
}

const reservePlace = async (user, code, places) => {
    const sessionid = await user.getSessionId(code)
    const {tkSession: session} = user
    const basketList = await setPropertyIfNotExist(user, 'basketList', async () => await getBasketList(sessionid), true)
    let result = []
    let status = true
    for (let i = 0; i < places.length; i++) {
        const {code: pCode, place, row} = places[i]
        if (pCode !== code) {
            status = false
            result = places.length === 1 ? [{}] : []
            break
        }
        let status_place
        let status_update
        if (basketList.find(({placeNumber, rowNumber}) => placeNumber === place && rowNumber === row)) {
            status_place = 3
            status_update = 1
        } else {
            const takeStatus = await setPropertyIfNotExist(user, 'takeStatus', () => createTakeStatus(user, code), true)
            status_place = await takeStatus(place, row)
            status_update = 0
            status = false
        }
        result.push({
            code: pCode,
            place,
            row,
            status_place,
            status_update
        })
    }
    // const placesFields =  {...result[0]}//places.length === 1 ? {...result[1]} : {places: result}
    if (status)
        await createTimerUnlock(user.tkSession, sessionid, timeoutReservePlaces)
    return {status, sign, /*session,*/ code, places: result}
}

const takeallshedules = async user => {
    try {
        const sessionid = await user.getSessionId()
        const shows = await fetchGet('shows', {sessionid})
        // console.log({shows})
        await user.updateLastUse(sessionid)
        const shedules = []
        const {mapEventsHall} = global
        mapEventsHall.clear()
        shows.filter(item => item.siteId === siteId).forEach(show => {
            const {name: films_name, showId: films_id} = show
            shedules.push(...show.events.map(event => {
                const {eventId: code, origin, displayHallName: halls_title, hallId} = event
                const [year, month, day, hour, minute, second] = sliceStr(origin, [4, 2, 2, 2, 2, 2])
                mapEventsHall.set(code, hallId)
                return {
                    code,
                    time: [hour, minute, second].join('.'),
                    date: [day, month, year].join('.'),
                    films_name,
                    films_id,
                    halls_title
                }
            }))
        })
        return {
            status: true,
            sign,
            shedules
        }
    } catch (error) {
        console.log('Error:', error)
        return {
            status: false,
            ...error
        }
    }
}

const takeallplacesshedules = async (user, eventId, isTakeBasketList = true) => {
    try {
        eventId = Number.parseInt(eventId)
        const sessionid = await user.getSessionId(eventId)
        const [basketList, result] = await Promise.all([
            isTakeBasketList ? (user.basketList || await getBasketList(sessionid)) : [],
            await fetchGet('eventmap', {sessionid, siteId, eventId})
        ])
        if (result.length === 0)
            throw {message: 'Event not exist'}
        if (isTakeBasketList && !user.basketList)
            user.basketList = basketList
        if (basketList.length === 0) // Якщо корзина на цьому сеансі пуста, видаляємо eventId щоб можна було на цей сеанс підв'язати інший евент
            await user.removeEventId(eventId)
        await user.updateLastUse(sessionid)
        const places = []
        const {mapEventsHall, mapPlaces} = global
        const {tkSession} = user
        const placesIDs = basketList.map(({placeId}) => placeId)
        result.forEach(({sectors, hallId}) => {
            mapEventsHall.set(eventId, hallId)
            sectors.forEach(({rows, sectorId}) => {
                rows.forEach(({number: row, places: pls}) => {
                    places.push(...pls.map(({number: place, status, placeId, prices}) => {
                        let {price: amount} = (Array.isArray(prices) && prices.length) > 0 ? prices[0] : [{price: NaN}]
                        place = Number.parseInt(place)
                        hallId = Number.parseInt(hallId)
                        row = Number.parseInt(row)
                        place = Number.parseInt(place)
                        placeId = Number.parseInt(placeId)
                        sectorId = Number.parseInt(sectorId)
                        amount = amount / 100
                        // console.log('mapPlaces.set:', {hallId, row, place, placeId, sectorId})
                        mapPlaces.set([hallId, row, place], {placeId, sectorId})
                        return {
                            code: eventId,
                            place,
                            row,
                            amount,
                            session: placesIDs.indexOf(placeId) === -1 ? '' : tkSession,
                            status_place: getStatus_place(status)
                        }
                    }))
                })
            })
        })
        // const {hallId: iRoom, name: hRoom} = result[0]
        return {status: true, sign, reversRow: true, /*iRoom, hRoom,*/ places}
    } catch
        (error) {
        console.log('Error:', error)
        return {
            status: false,
            ...error
        }
    }
}

const updateplace = async (user, code, place, row, req_status_place) => {
    // console.log({user, code, place, row, status_place})
    try {
        code = Number.parseInt(code)
        place = Number.parseInt(place)
        row = Number.parseInt(row)
        req_status_place = Number.parseInt(req_status_place)
        const {mapEventsHall, mapPlaces} = global
        let hallId = mapEventsHall.get(code)
        let placeWasUpdating = false
        const takeStatus = await setPropertyIfNotExist(user, 'takeStatus', createTakeStatus(user, code))
        if (!hallId) {
            await takeStatus()
            placeWasUpdating = true
            hallId = mapEventsHall.get(code)
        }
        // console.log('get placeItem:', {hallId, row, place})
        let placeItem = mapPlaces.get([hallId, row, place])
        if (!placeItem) {
            // console.log({placeItem})
            if (placeWasUpdating)
                throw {message: `Place [${row}:${place}] not exist!`}
            await takeStatus()
            placeItem = mapPlaces.get([hallId, row, place])
            if (!placeItem)
                throw {message: `Place [${row}:${place}] not exist!`}
        }
        const {placeId, sectorId} = placeItem
        switch (req_status_place) {
            case 1:
            case 2:
                // const getBackMethod = await lockMethodResult(user, 'getSessionId', [code])
                const {items, ...result} = await lockPlace(user, code, placeId, sectorId, place, row, req_status_place === 2)
                // getBackMethod()
                // console.log({items})
                if (items.length === 0) // Якщо корзина на цьому сеансі пуста, видаляємо eventId щоб можна було на цей сеанс підв'язати інший евент
                    await user.removeEventId(code)
                return result
                break
            case 3:
                const {places, ...res} = await reservePlace(user, code, [{code, place, row}])
                return {...res, ...places[0]}
                break
        }
    } catch (error) {
        console.log('Error:', error)
        return {
            status: false,
            ...error
        }
    }
}

const checkPlaces = (code, places) => {
    let status_place
    const keys = ['code', 'place', 'row', 'status_place', 'amount']
    for (let i = 0; i < places.length; ++i) {
        keys.forEach(key => {
            if (places[i][key] && typeof places[i][key] !== 'number')
                places[i][key] = Number.parseInt(places[i][key])
        })
        if (code !== places[i].code)
            throw {message: `The code is incorrect:${JSON.stringify({code, places})}`}
        if (!status_place)
            status_place = places[i].status_place
        else if (status_place !== places[i].status_place)
            throw {message: `The status_places is different:${JSON.stringify({places})}`}
    }
    return status_place
}

const sendbuytickets = async (user, code, email, places, sell_sign) => {
    try {
        code = Number.parseInt(code)
        const status_place = checkPlaces(code, places)
        places.forEach(item => {
            ['amount', 'code', 'place', 'row', 'status_place'].forEach(key => item[key] = Number.parseInt(item[key]))
        })
        switch (status_place) {
            case 3:
                return await reservePlace(user, code, places)
                break
            case 4:
                const {tkSession: session} = user
                // console.log('sell_sign:', md5(sign + session + sell_sign_arg))
                if (md5(sign + session + sell_sign_arg) !== sell_sign)
                    throw {message: `Wrong sell_sign`}
                const sessionid = await user.getSessionId(code)
                const basketList = [...(await setPropertyIfNotExist(user, 'basketList', async () => await getBasketList(sessionid), true))]
                const boughtPlaces = []
                for (let i = 0; i < places.length; i++) {
                    const {code: pCode, place, row, amount} = places[i]
                    const index = basketList.findIndex(
                        ({eventId, placeNumber, rowNumber}) => eventId === pCode && placeNumber === place && rowNumber === row
                    )
                    if (index !== -1) {
                        if (basketList[index].price !== amount)
                            throw {message: 'Wrong price'}
                        boughtPlaces.push(...basketList.splice(index, 1))
                    } else {
                        throw {message: `Place (row:${row}; place:${place};) is not reserved`}
                    }
                }
                const unlockPromises = basketList.map(
                    ({placeId, sectorId, placeNumber, rowNumber}) => lockPlace(user, code, placeId, sectorId, placeNumber, rowNumber, false)
                )
                const unlockResults = await Promise.all(unlockPromises)
                const notUnlockedPlaces = unlockResults.filter(({status}) => !status)
                if (notUnlockedPlaces.length)
                    throw {
                        message: `Can't unlock places: ${JSON.stringify(notUnlockedPlaces.map(({place, row}) => ({
                            place,
                            row
                        })))}`
                    }
                const result = await fetchGet('basket-buy', {sessionid, email})
                if (result.code === 0) {
                    const tickets = result.tickets.map(({rowNumber, placeNumber, placeId, price, barcode}) => ({
                        rowNumber,
                        placeNumber,
                        placeId,
                        price,
                        barcode
                    }))
                    const {orderId} = result
                    await user.addOrder(code, orderId, tickets)
                    /////////////////// Можливо замість стерання EventId повертати місця які були розлоченні в unlockPromises знов в lock
                    await user.removeEventId(code)
                    ///////////////////
                    return {
                        status: true,
                        sign,
                        // session,
                        code,
                        places: tickets.map(({rowNumber, placeNumber}) => ({
                            code,
                            place: Number.parseInt(placeNumber),
                            row: Number.parseInt(rowNumber),
                            status_place: 4,
                            status_update: 1
                        }))
                    }
                } else {
                    const {message} = result
                    throw {message}
                }
                break
        }
    } catch (error) {
        console.log('Error:', error)
        return {
            status: false,
            ...error
        }
    }
}

const moneybackforplaces = async (user, eventId, email, places, sell_sign) => {
    let update = f => f
    try {
        eventId = Number.parseInt(eventId)
        const status_place = checkPlaces(eventId, places)
        places.forEach(item => {
            ['amount', 'code', 'place', 'row', 'status_place'].forEach(key => item[key] = Number.parseInt(item[key]))
        })
        if (status_place !== 1)
            throw {message: 'Wrong status_place'}
        const {tkSession: session} = user
        if (md5(sign + session + sell_sign_arg) !== sell_sign)
            throw {message: `Wrong sell_sign`}
        const refundMap = new Map()
        const orders = await user.getOrders(eventId)
        orders.forEach(({orderId, tickets}) => {
            const foundTickets = tickets.filter(({isRefund, placeNumber, rowNumber}) => places.find(({place, row}) =>
                !isRefund && place == placeNumber && row == rowNumber
            ))
            if (foundTickets.length > 0)
                refundMap.set(orderId, (refundMap.get(orderId) || []).concat(foundTickets))
        })
        if (refundMap.size !== places.length)
            throw {message: 'Places not purchased'}
        const sessionid = await user.getSessionId(eventId)
        const refundPlaces = []
        for (let [orderId, tickets] of refundMap) {
            const refundBasketList = await fetchGet('refund-basket-list', {sessionid})
            update = async () => await user.updateLastUse(sessionid)
            const ticketsNotInBasketList = [...tickets]
            refundBasketList.items = refundBasketList.items.filter(item => {
                const indexTicket = ticketsNotInBasketList.findIndex(({rowNumber, placeNumber}) => item.rowNumber == rowNumber && item.placeNumber == placeNumber)
                if (indexTicket !== -1)
                    ticketsNotInBasketList.splice(indexTicket, 1)
                return indexTicket === -1
            })
            if (refundBasketList.items.length !== 0) {
                const orders = await fetchGet('get-orders', {sessionid, siteId, eventId})
                for (let ticketItems of refundBasketList.items) {
                    const {placeId, rowNumber: t_rowNumber, placeNumber: t_placeNumber} = ticketItems
                    const {barcode} = orders.tickets.find(({rowNumber, placeNumber}) => rowNumber === t_rowNumber && placeNumber === t_placeNumber) || {}
                    if (!barcode)
                        throw {message: `Not found ticket (row:${t_rowNumber}; place:${t_placeNumber};) in orders`}
                    const unlockResult = await fetchGet('refund-unlock', {sessionid, siteId, eventId, placeId, barcode})
                    if (unlockResult.code !== 0)
                        throw {message: unlockResult.message}
                }
            }
            // const lockPromises = tickets.map(({placeId, barcode}) =>
            //     fetchGet(`${url}/refund-lock/?sessionid=${sessionid}&siteId=${siteId}/&eventId=${code}&placeId=${placeId}&barcode=${barcode}`)
            // )
            const lockResults = [] //await Promise.all(lockPromises)
            for (let i = 0; i < ticketsNotInBasketList.length; ++i) {
                const {placeId, barcode} = ticketsNotInBasketList[i]
                lockResults.push(await fetchGet('refund-lock', {sessionid, siteId, eventId, placeId, barcode}))
            }
            if (lockResults.reduce((acc, {code}) => acc | code, 0) === 0) {
                const refundStart = await fetchGet('refund-start', {sessionid})
                if (refundStart.code !== 0)
                    throw {message: refundStart.message}
                const refundConfirm = await fetchGet('refund-confirm', {sessionid, orderId})
                if (refundConfirm.code !== 0)
                    throw {message: refundStart.message}
                tickets.forEach(ticket => {
                    refundPlaces.push({
                        code: eventId,
                        place: ticket.placeNumber,
                        row: ticket.rowNumber,
                        status_place: 1,
                        status_update: true
                    })
                    ticket.isRefund = true
                })
            } else {
                throw {message: lockResults.find(({code}) => code !== 0).message}
            }
            // return {orderId, tickets, refundBasketList}
            // return lockResults
        }
        await update()
        await user.removeEventId(eventId)
        return {
            status: true,
            sign,
            method: 'moneybackforplaces',
            places: refundPlaces
        }
    } catch (error) {
        console.log('Error:', error)
        await update()
        return {
            status: false,
            ...error
        }
    }
    // places.forEach(({}))
}

module.exports = {
    takeallshedules,
    takeallplacesshedules,
    updateplace,
    sendbuytickets,
    moneybackforplaces,
    createTimerUnlock,
    loadTimersUnlock
}