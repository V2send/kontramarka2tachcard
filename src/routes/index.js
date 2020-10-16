const express = require('express');
const router = express.Router();
const config = require('config')
const {getUser} = require('../user')
const {takeallshedules} = require('../methods')

const checkSign = (req, res, next) => {
    // console.log('empty use:', req)
    const {sign} = req.body
    if (sign !== config.get('sign'))
        res.status(500).send('Failed sign')
    else
        next()
}

const getCommonUser = async (req, res, next) => {
    const user = await getUser('')
    console.log('sessionid:', user.sessionid)
    req.user = user
    next()
}

router.use('/', checkSign)
router.use(getCommonUser)

router.post('/takeallshedules', (req, res, next) => {
    console.log('takeallshedules')
    takeallshedules(req.user)
    res.status(200).json('ok')
})


module.exports = router;
