const express = require('express');
const router = express.Router();
const config = require('config')
const {getUser} = require('../user')
const {takeallshedules, takeallplacesshedules} = require('../methods')

const checkSign = (req, res, next) => {
    // console.log('empty use:', req)
    const {sign} = req.body
    if (sign !== config.get('Tachcard.sign'))
        res.status(500).send('Failed sign')
    else
        next()
}

const getCommonUser = async (req, res, next) => {
    const session = req.body.session || '_'
    const user = await getUser(session)
    console.log('sessionid:', user.sessionid)
    req.user = user
    next()
}

// router.post('/test', async (req, res, next) => {
//     console.log('test')
//     try {
//         // const {code} = req.body
//         const result = await test()
//         res.status(200).json(result)
//     } catch (e) {
//         res.status(e.code).json(e)
//     }
// })

router.use(checkSign)
router.use(getCommonUser)

router.post('/takeallshedules', async (req, res, next) => {
    console.log('takeallshedules')
    try {
        const result = await takeallshedules(req.user)
        res.status(200).json(result)
    } catch (e) {
        res.status(e.code).json(e)
    }
})

router.post('/takeallplacesshedules', async (req, res, next) => {
    console.log('takeallplacesshedules')
    try {
        const {code} = req.body
        const result = await takeallplacesshedules(req.user, code)
        res.status(200).json(result)
    } catch (e) {
        res.status(e.code).json(e)
    }
})


module.exports = router;
