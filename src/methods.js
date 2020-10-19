const fetch = require('node-fetch')
const config = require('config')

const {url, siteId} = config.get('Kontramarka')
const {sign} = config.get('Tachcard')

const sliceStr = (str, parts) => {
    let start = 0
    return parts.map((index, i, arr) => {
        start += i === 0 ? 0 : arr[i - 1]
        return str.slice(start, index + start)
    })
}

const getStatus_place = status => {
    switch (status) {
        case 0: return 1 //свободно
        case 1: return 2 //в корзине
        case 2: return 4 //продано
        case 3: return 3 //забронировано
    }
}

const takeallshedules = async user => {
    try {
        const shows = await fetch(
            `${url}/shows/?sessionid=${user.sessionid}`,
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
        // console.log({shows})
        // user.updateLastUse()
        const shedules = []

        shows.filter(item => item.siteId === siteId).forEach(show => {
            const {name: films_name} = show
            shedules.push(...show.events.map(event => {
                const {eventId: code, origin, displayHallName: halls_title} = event
                const [year, month, day, hour, minute, second] = sliceStr(origin, [4, 2, 2, 2, 2, 2])
                return {
                    code,
                    time: [hour, minute, second].join('.'),
                    date: [day, month, year].join('.'),
                    films_name,
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
        throw {
            status: false,
            ...error
        }
    }
}

const takeallplacesshedules = async (user, code) => {
    try {
        const result = await fetch(
            `${url}/eventmap/?sessionid=${user.sessionid}&siteId=${siteId}&eventId=${code}`,
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
        user.updateLastUse()
        const places = []
        result.forEach(({sectors, hallId}) => {
            sectors.forEach(({rows}) => {
                rows.forEach(({number: row, places: pls}) => {
                    places.push(...pls.map(({number: place, status, placeId}) => {
                        return {code, place, row,  amount: NaN, session: '', status_place: getStatus_place(status)}
                    }))
                })
            })
        })
        return {status: true, sign, places}
    } catch
        (error) {
        console.log('Error:', error)
        return {
            status: false,
            ...error
        }
    }
}

module.exports = {takeallshedules, takeallplacesshedules}