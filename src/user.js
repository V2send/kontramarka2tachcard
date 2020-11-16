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
    constructor(username, password) {
        this[privateSymbol] = {}
        this[privateSymbol].username = username
        this[privateSymbol].password = password

        this[privateSymbol].clearNotExistSessions = async () => {
            const {dbUser} = this[privateSymbol]
            if (!dbUser)
                throw 'Tachcard session is not init'
            const len = dbUser.sessions.length
            dbUser.sessions = dbUser.sessions.filter(({lastUsedDate}) => (new Date()) - lastUsedDate < aliveTimeout)
            if (len !== dbUser.sessions.length)
                await dbUser.save()
        }
    }

    async auth() {
        // this[privateSymbol].sessionid = 'vgfh60h5awyrx0rlz4nuxq'
        // return
        if (!this[privateSymbol].dbUser)
            throw 'User is not initialized'
        return await fetch(
            `${url}/login/?username=${username}&password=${password}`,
            {
                method: 'POST',
                body: "",
                headers: {'Content-Type': 'application/json'}
            }
        )
            .then(res => res.text())
        // this[privateSymbol].dbUser.lastUsedDate = new Date()
        // await this[privateSymbol].dbUser.save()
    }

    // async reauthIfNotAlive() {
    //     const {dbUser, username, password} = this[privateSymbol]
    //     if (!dbUser || !username || !password)
    //         throw 'User is not initialized'
    //     if ((new Date()) - dbUser.lastUsedDate > aliveTimeout) {
    //         await this.auth(username, password)
    //     }
    // }

    async initSession(tkSession) {
        let dbUser = await DBUsers.findOne({tkSession})
        if (dbUser) {
            // console.log(dbUser.sessions, Array.isArray(dbUser.sessions))
            this[privateSymbol].dbUser = dbUser
            await this[privateSymbol].clearNotExistSessions()
            // const aliveSessions = dbUser.sessions.find(({lastUsedDate}) => (new Date()) - lastUsedDate > aliveTimeout)
            // console.log({aliveSessions})

            // if ((new Date()) - dbUser.lastUsedDate > aliveTimeout) {
            //     dbUser.sessionid = ''
            //     await dbUser.save()
            // }
        } else {
            dbUser = new DBUsers({tkSession})
            await dbUser.save()
            this[privateSymbol].dbUser = dbUser
        }
    }

    async getSessionId(eventId = 0) {
        // eventId = Number.parseInt(eventId)
        const {dbUser, clearNotExistSessions} = this[privateSymbol]
        await clearNotExistSessions()
        const session = dbUser.sessions.find(s => s.eventId === eventId || s.eventId === -1)
        console.log('dbUser.sessions:', dbUser.sessions)
        let sessionid
        if (!session) {
            // auth new sessionid
            sessionid = await this.auth()
            dbUser.sessions.push({
                sessionid,
                eventId
            })
            await dbUser.save()
        } else {
            // get sessionid from mongodb
            if (session.eventId === -1) {
                session.eventId = eventId
                await dbUser.save()
            }
            sessionid = session.sessionid
        }
        return sessionid
        // return this[privateSymbol].dbUser ? this[privateSymbol].dbUser.sessionid : ''
    }
    async addOrder(eventId, orderId, tickets) {
        const {dbUser} = this[privateSymbol]
        dbUser.orders.push({eventId, orderId, tickets})

        await dbUser.save()
    }
    async removeEventId(eventId) {
        const {dbUser} = this[privateSymbol]
        for (let i = 0; i < dbUser.sessions.length; i++) {
            if (dbUser.sessions[i].eventId === eventId) {
                dbUser.sessions[i].eventId = -1
                await dbUser.save()
                return true
            }
        }
        return false
    }

    async getOrders(eventId) {
        const {dbUser} = this[privateSymbol]
        const result = dbUser.orders.filter(item => item.eventId === eventId)
        return result
    }

    get tkSession() {
        return this[privateSymbol].dbUser.tkSession
    }

    // async test() {
    //     this[privateSymbol].dbUser.orders.push({
    //         orderId: 4123,
    //         eventId: 321,
    //         places: [{row: 1, place: 1, placeId: 345}]
    //     })
    //     // await this[privateSymbol].dbUser.save()
    // }

    async updateLastUse(sessionid) {
        const {dbUser, clearNotExistSessions} = this[privateSymbol]
        await clearNotExistSessions()
        const session = dbUser.sessions.find(s => s.sessionid === sessionid)
        if (session) {
            session.lastUsedDate = new Date()
            await dbUser.save()
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

const getUser = async (session = '_') => {
    const user = new User(username, password)
    await user.initSession(session)
    return user
    /*let user = mapUsers.get(session)
    if (!user) {
        user = new User(username, password)
        await user.initSession(session)
        // if (!user.sessionid)
        //     await user.auth()
        mapUsers.set(session, user)
    }
    return user*/
}

module.exports = {getUser}