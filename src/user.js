const fetch = require('node-fetch')
const config = require('config')
const {users: DBUsers} = require('./models/users')

const mapUsers = new Map()
const {username, password, url, aliveTimeout} = config.get('Kontramarka')

const privateSymbol = Symbol('private')

// const timeAlive = () => {
//     const date = new Date()
//     date.setMinutes(date.getMinutes() + aliveTimeout)
//     return date
// }

class User {
    constructor() {
        this[privateSymbol] = {}
    }

    async auth(username, password) {
        // this[privateSymbol].sessionid = 'vgfh60h5awyrx0rlz4nuxq'
        // return
        if (!this[privateSymbol].dbUser)
            throw 'User is not initialized'
        this[privateSymbol].dbUser.sessionid = await fetch(
            `${url}/login/?username=${username}&password=${password}`,
            {
                method: 'POST',
                body: "",
                headers: {'Content-Type': 'application/json'}
            }
        )
            .then(res => res.text())
        this[privateSymbol].dbUser.lastUsedDate = new Date()
        await this[privateSymbol].dbUser.save()
    }

    async initSession(session) {
        let dbUser = await DBUsers.findOne({session})
        if (dbUser) {
            if ((new Date()) - dbUser.lastUsedDate > aliveTimeout) {
                dbUser.sessionid = ''
                await dbUser.save()
            }
        } else {
            dbUser = new DBUsers({session})
            await dbUser.save()
        }
        this[privateSymbol].dbUser = dbUser
    }

    get sessionid() {
        return this[privateSymbol].dbUser ? this[privateSymbol].dbUser.sessionid : ''
    }

    async updateLastUse() {
        if (this[privateSymbol].dbUser) {
            this[privateSymbol].dbUser.lastUsedDate = new Date()
            await this[privateSymbol].dbUser.save()
        }
    }
}

// const getUser = async (session = '') => {
//     let user = mapUsers.get(session)
//     if (!user) {
//         user = new User()
//         await user.auth(username, password)
//         mapUsers.set(session, user)
//     }
//     return user
// }

const getUser = async (session = '') => {
    let user = mapUsers.get(session)
    if (!user) {
        user = new User()
        await user.initSession(session)
        if (!user.sessionid)
            await user.auth(username, password)
        mapUsers.set(session, user)
    }
    return user
}

module.exports = {getUser}