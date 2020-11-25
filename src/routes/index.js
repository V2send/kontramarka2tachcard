const express = require('express');
const router = express.Router();
const config = require('config')
const {getUser} = require('../user')
const {takeallshedules, takeallplacesshedules, updateplace, sendbuytickets, moneybackforplaces, createTimerUnlock} = require('../methods')

const checkSign = (req, res, next) => {
    // console.log('empty use:', req)
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

router.post('/testTimer', async (req, res, next) => {
    const {tkSession, sessionid, timeout} = req.body
    await createTimerUnlock(tkSession, sessionid, timeout)
    res.send('ok')
})

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
        () => {throw `Wrong field method.`}
    ))

router.post('/moneybackforplaces', makeMiddlewareMethod(async ({user, body: {code, method, email, places, sell_sign}}) =>
    method === 'moneybackforplaces' ?
        await moneybackforplaces(user, code, email, places, sell_sign) :
        () => {throw `Wrong field method.`}
))

module.exports = router;
