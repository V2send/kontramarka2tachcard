const express = require('express');
const router = express.Router();
const config = require('config')
const fetch = require('node-fetch')
const {getUser} = require('../user')
const {takeallshedules, takeallplacesshedules, updateplace, sendbuytickets, moneybackforplaces} = require('../methods')
const {isUse: isUseFinExpert} = config.get('useFinExpert')
const {responseCompare} = require('../models/responseCompare')

const redirectMethods = {
    // takeallplacesshedules: async ({user, body: {code}}) => await takeallplacesshedules(user, code),
    updateplace: async ({user, body: {code, place, row, status_place}}) => await updateplace(user, code, place, row, status_place),
    sendbuytickets: async ({user, body: {code, method, email, places, sell_sign}}) =>
        method === 'sendbuytickets' ?
            await sendbuytickets(user, code, email, places, sell_sign) :
            () => {
                throw `Wrong field method.`
            },
    moneybackforplaces: async ({user, body: {code, method, email, places, sell_sign}}) =>
        method === 'moneybackforplaces' ?
            await moneybackforplaces(user, code, email, places, sell_sign) :
            () => {
                throw `Wrong field method.`
            }
}

const checkSign = (req, res, next) => {
    const {sign} = req.body
    if (sign !== config.get('Tachcard.sign'))
        res.status(500).json({status: false, message: 'Wrong sign'})
    else
        next()
}

const getCommonUser = async (req, res, next) => {
    const session = req.body.session || '_'
    const user = await getUser(session)
    // await user.reauthIfNotAlive()
    // console.log('sessionid:', user)
    req.user = user
    next()
}

const makeMiddlewareMethod = handler => async (req, res) => {
    try {
        const result = await handler(req)
        res.status(200).json(result)
    } catch (e) {
        if (e instanceof Error)
            res.status(500).json({status: false, stack: e.stack, message: e.message})
        else
            res.status(500).json(e)
    }
}

const compareObjects = (obj1, obj2, handlerCmpValues = (value1, value2) => value1 === value2) => {
    if (typeof obj1 === 'object') {
        if (typeof obj2 !== 'object')
            return false
        if (Array.isArray(obj1)) {
            if (!Array.isArray(obj2) || obj2.length !== obj1.length)
                return false
            obj1 = obj1.sort()
            obj2 = obj2.sort()
        }
        const [keys1, keys2] = [obj1, obj2].map(obj => Object.keys(obj).sort())
        // console.log({keys1, keys2})
        if (keys1.length !== keys2.length || JSON.stringify(keys1) !== JSON.stringify(keys2))
            return false
        for (let key of keys1) {
            if (!compareObjects(obj1[key], obj2[key], handlerCmpValues))
                return false
        }
        return true
    }
    if (typeof obj2 === 'object')
        return false
    return handlerCmpValues(obj1, obj2)
}

const finExpertMiddleware = async (req, res) => {
    const body = JSON.stringify(req.body)
    const {url} = req
    const {hostname, port} = config.get('useFinExpert')
    console.log(`feFetch to: ${hostname}:${port}${url}`)
    const feRequestPromise = fetch(
        `${hostname}:${port}${url}`,
        {
            method: 'POST',
            body,
            headers: {'Content-Type': 'application/json'}
        })
        .then(res => res.json())
        .then(result => {
            console.log('feFetch res.status(200):', {result})
            res.status(200).json(result)
            return result
        })
    const method = url.substring(1)
    const redirectMethod = redirectMethods[method]
    const {codeToEventId, eventIdToCode} = global
    console.log({redirectMethod})
    if (redirectMethod) {
        let {code} = req.body
        if (!code)
            return
        // code = Number.parseInt(code)
        if (codeToEventId(code) === code)
            return
        const replaceAllValues = (obj, handler) => {
            if (Array.isArray(obj))
                obj.forEach(value => replaceAllValues(value, handler))
            else if (typeof obj === 'object') {
                Object.keys(obj).forEach(key => obj[key] = handler(key, obj[key]))
                Object.values(obj).map(value => replaceAllValues(value, handler))
            }
        }
        const newBody = req.body
        // const parseCode = handler => (key, code) => key === 'code' ? handler(code) : code
        const parseToNumber = codeHandler => (key, value) => key === 'code' ?
            Number.parseInt(codeHandler(value))
            : (['place', 'row', 'status_place'].indexOf(key) !== -1 ?
                Number.parseInt(value)
                : value)

        replaceAllValues(newBody, parseToNumber(codeToEventId))
        console.log({newBody})
        const {session} = newBody
        const user = await getUser(session)
        let kmRequestPromise = redirectMethod({user, body: newBody})// updateplace(user, code, place, row, status_place)
        // console.log('Run promises')
        const [feResponse, kmResponse] = await Promise.all([feRequestPromise, kmRequestPromise])
        // console.log('result requests:', {feResponse, kmResponse})
        const cmpKmResponse = JSON.parse(JSON.stringify(kmResponse))
        const cmpFeResponse = JSON.parse(JSON.stringify(feResponse))
        replaceAllValues(cmpKmResponse, parseToNumber(eventIdToCode))
        replaceAllValues(cmpFeResponse, parseToNumber(f=>f))
        if (method === 'takeallplacesshedules') {
            [cmpKmResponse, cmpFeResponse].forEach((obj, i) => {
                // delete obj.iRoom
                // delete obj.hRoom
                obj.places.forEach(place => {
                    if (i === 0)
                        place.code = eventIdToCode(place.code)
                    if (place.status_place === 1 || place.session !== session)
                        place.session = ''
                    if (place.status_place === 3)
                        place.status_place = 2
                })
                obj.places.sort((a, b) => {
                    if (a.row > b.row)
                        return 1
                    else if (a.row === b.row) {
                        if (a.place > b.place)
                            return 1
                        else
                            return -1
                    }
                    else
                        return -1
                })
            })
        }
        const isEqual = compareObjects(cmpFeResponse, cmpKmResponse, (v1, v2) => typeof v1 === 'boolean' || typeof v2 === 'boolean' ? v1 == v2 : v1 === v2)
        // console.log({feResult: feResponse, kmResult: kmResponse, isEqual})
        const record = new responseCompare({
            date: new Date(),
            method,
            request: req.body,
            feResponse,
            kmResponse,
            isEqual
        })
        await record.save()
        // new Promise(async resolve => {
        //
        // })
    }

}

router.use(isUseFinExpert ? finExpertMiddleware : (req, res, next) => next())

router.use(checkSign)
router.use(getCommonUser)

router.post('/takeallshedules', makeMiddlewareMethod(async ({user}) => await takeallshedules(user)))

router.post('/takeallplacesshedules', makeMiddlewareMethod(async ({user, body: {code}}) => await takeallplacesshedules(user, code)))

router.post('/updateplace', makeMiddlewareMethod(async ({user, body: {code, place, row, status_place}}) => await updateplace(user, code, place, row, status_place)))

router.post('/sendbuytickets', makeMiddlewareMethod(async ({user, body: {code, method, email, places, sell_sign}}) =>
    method === 'sendbuytickets' ?
        await sendbuytickets(user, code, email, places, sell_sign) :
        () => {
            throw `Wrong field method.`
        }
))

router.post('/moneybackforplaces', makeMiddlewareMethod(async ({user, body: {code, method, email, places, sell_sign}}) =>
    method === 'moneybackforplaces' ?
        await moneybackforplaces(user, code, email, places, sell_sign) :
        () => {
            throw `Wrong field method.`
        }
))

module.exports = router;
