const express = require('express');
const router = express.Router();
const config = require('config')
const {getUser} = require('../user')

const checkSign = (req, res, next) => {
    // console.log('empty use:', req)
    const {sign} = req.body
    if (sign !== config.get('sign'))
        res.status(500).send('Failed sign')
    else
        next()
}

const authUser = async (req, res, next) => {
    const user = await getUser('')
    console.log('sessionid:', user.sessionid)
    next()
}

router.use(authUser)

router.post('/takeallshedules', (req, res, next) => {
    console.log('takeallshedules')
    res.status(200).json('ok')
})

router.use('/', checkSign)

module.exports = router;
