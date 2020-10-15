const fetch = require('node-fetch')
const config = require('config')

const mapUsers = new Map()
const {username, password, url} = config.get('Kontramarka')

const privateSymbol = Symbol('private')

class User {
    constructor() {
        this[privateSymbol] = {}
    }

    async auth(username, password) {
        console.log('prv:', this[privateSymbol])
        this[privateSymbol].sessionid = await fetch(
            `${url}/login/?username=${username}&password=${password}`,
            {
                method: 'POST',
                body: "",
                headers: {'Content-Type': 'application/json'}
            }
        )
            .then(res => res.text())
    }

    get sessionid() {
        return this[privateSymbol].sessionid
    }
}

const getUser = async (session) => {
    let user = mapUsers.get(session)
    if (!user) {
        user = new User()
        await user.auth(username, password)
        mapUsers.set(session, user)
    }
    return user
}

module.exports = {getUser}