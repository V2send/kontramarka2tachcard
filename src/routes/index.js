const express = require('express');
const router = express.Router();
const config = require('config')
const fetch = require('node-fetch')
const {getUser} = require('../user')
const {takeallshedules, takeallplacesshedules, updateplace, sendbuytickets, moneybackforplaces} = require('../methods')
const {isUse: isUseFinExpert} = config.get('useFinExpert')
const {responseCompare} = require('../models/responseCompare')

const redirectMethods = {
    takeallplacesshedules: async ({user, body: {code}}) => await takeallplacesshedules(user, code),
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
    const feRequestPromise = fetch(
        `${hostname}:${port}${url}`,
        {
            method: 'POST',
            body,
            headers: {'Content-Type': 'application/json'}
        })
        .then(res => res.json())
        .then(result => {
            res.status(200).json(result)
            return result
        })
    const method = url.substring(1)
    const redirectMethod = redirectMethods[method]
    if (redirectMethod) {
        const {codeToEventId, eventIdToCode} = global
        const replaceAllValues = (obj, key, handler) => {
            if (Array.isArray(obj))
                obj.forEach(value => replaceAllValues(value, key, handler))
            else if (typeof obj === 'object') {
                if (obj.hasOwnProperty(key))
                    obj[key] = handler(obj[key])
                Object.values(obj).map(value => replaceAllValues(value, key, handler))
            }
        }
        const newBody = req.body
        replaceAllValues(newBody, 'code', codeToEventId)
        // console.log(newBody)
        const {session, code, place, row, status_place} = newBody
        const user = await getUser(session)
        let kmRequestPromise = redirectMethod({user, body: newBody})// updateplace(user, code, place, row, status_place)
        const [feResponse, kmResponse] = await Promise.all([feRequestPromise, kmRequestPromise])
        const cmpKmResponse = JSON.parse(JSON.stringify(kmResponse))
        const cmpFeResponse = JSON.parse(JSON.stringify(feResponse))
        replaceAllValues(cmpKmResponse, 'code', eventIdToCode)
        if (method === 'takeallplacesshedules') {
            [cmpKmResponse, cmpFeResponse].forEach(obj => {
                delete obj.iRoom
                delete obj.hRoom
            })
        }
        const isEqual = compareObjects(cmpFeResponse, cmpKmResponse, (v1, v2) => typeof v1 === 'boolean' || typeof v2 === 'boolean' ? v1 == v2 : v1 === v2)
        // console.log({feResult: feResponse, kmResult: kmResponse, isEqual})
        const record = new responseCompare({method, request: req.body, feResponse, kmResponse, isEqual})
        await record.save()
        // new Promise(async resolve => {
        //
        // })
    }

}

router.use(isUseFinExpert ? finExpertMiddleware : (req, res, next) => next())

router.use(checkSign)
router.use(getCommonUser)

router.post('/test', async (req, res, next) => {
    console.log('test')
    try {
        const {user, body: {code}} = req
        const sessionid = await user.getSessionId(code)
        // await user.removeEventId(code)
        await user.updateLastUse(sessionid)
        res.status(200).json({sessionid})
    } catch (e) {
        res.status(e.code).json(e)
    }
})


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
