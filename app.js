
const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')
const colors = require('./color.json')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})
// If modifying these scopes, delete token.json.
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
]
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json'

// Load client secrets from a local file.
fs.readFile('client_secret.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err)
  // Authorize a client with credentials, then call the Google Sheets API.
  authorize(JSON.parse(content), start)
  // authorize(JSON.parse(content), listEvents)
})

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize (credentials, callback) {
  const {
    client_secret,
    client_id,
    redirect_uris
  } = credentials.installed
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0])

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback)
    oAuth2Client.setCredentials(JSON.parse(token))
    callback(oAuth2Client)
  })
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken (oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  })
  console.log('Authorize this app by visiting this url:', authUrl)
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close()
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err)
      oAuth2Client.setCredentials(token)
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err)
        console.log('Token stored to', TOKEN_PATH)
      })
      callback(oAuth2Client)
    })
  })
}

async function start (auth) {
  const spreadsheetId = await AnimeTransferApp.getSpreadsheetId()
  const range = await AnimeTransferApp.getRange()
  const calendarId = await AnimeTransferApp.getCalendarId()
  const app = new AnimeTransferApp({ auth, calendarId, spreadsheetId, range })
  const animes = await app.getAnimes()
  const go = await getAnswer(`There's ${animes.length} animes.\n\nContinue? (enter any value and press enter to terminate)`, false)
  if (go) {
    console.log('Terminating...')
  }
  const result = await app.addAnimesToCalendar(animes)
  console.log('Done')
  console.log(result)
  process.exit(1)
}

class AnimeTransferApp {
  constructor ({
    auth,
    calendarVersion = 'v3',
    sheetsVersion = 'v4',
    range,
    spreadsheetId,
    calendarId
  }) {
    if (!spreadsheetId) {
      console.log('no sheets id was given, try again')
      process.exit(0)
    }
    this.spreadsheetId = spreadsheetId
    if (!range || !/[a-z][0-9]+:[a-z][0-9]+/i.test(range)) {
      console.log('wrong range')
      process.exit(0)
    }
    this.range = range

    if (!calendarId) {
      console.log('no calendar id was given, try again')
      process.exit(0)
    }
    this.calendarId = calendarId

    this.getAnimes = this.getAnimes.bind(this)
    this.addAnimesToCalendar = this.addAnimesToCalendar.bind(this)

    this.sheets = google.sheets({
      version: sheetsVersion,
      auth
    })

    this.calendar = google.calendar({
      version: calendarVersion,
      auth
    })
  }

  static async getSpreadsheetId (argv = true) {
    if (argv) {
      var argvSheetId = getArgv('--sheetid')
    }
    const spreadsheetId =  argvSheetId ? argvSheetId : await getAnswer('Gimme spreadsheet id: ')
    if (!spreadsheetId) {
      console.log(`no id was given, try again`)
      return AnimeTransferApp.getSpreadsheetId(false)
    }
    console.log(`Got sheet id${argv ? ' from command line' : ''}: ${spreadsheetId}}`)
    return spreadsheetId
  }

  static async getRange (argv = true) {
    if (argv) {
      var argvRangeId = getArgv('--range')
    }
    const range = argvRangeId ? argvRangeId : await getAnswer('Gimme range for this spreadsheet values (default - A2:H9): ', 'A2:H9')
    if (!range || !/[a-z][0-9]+:[a-z][0-9]+/i.test(range)) {
      console.log(`wrong range: "${range}"`)
      return AnimeTransferApp.getRange(false)
    }
    console.log(`Got range${argv ? ' from command line' : ''}: ${range}`)
    return range
  }

  static async getCalendarId (argv = true) {
    if (argv) {
      var argvCalendarId = getArgv('--calendarid')
    }
    const calendarId = argvCalendarId ? argvCalendarId : await getAnswer('Gimme calendar id: ')
    if (!calendarId) {
      console.log('no id was given, try again')
      return AnimeTransferApp.getCalendarId(false)
    }
    console.log(`Got calendar id${argv ? ' from command line' : ''}: ${calendarId}`)
    return calendarId
  }

  async getAnimes () {
    console.log(this.spreadsheetId, this.range)
    const sheetsValues = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.range
    })
    return flatten(sheetsValues.data.values.map(el => el.filter(Boolean).map(parseAnimeData)), 1)
  }

  async addAnimesToCalendar (animes) {
    const response = []
    for (const anime of animes) {
      const time = parseTime(anime.onair)
      const date = parseDate(anime.startDate)
      if (time.hour >= 24) {
        time.hour = time.hour - 24
        date.date++
      }
      let startDateTime = `2019-${formatDate(date.month)}-${formatDate(date.date)}T${formatDate(time.hour)}:${formatDate(time.minute)}:00`
      if (time.minute >= 30) {
        time.hour++
        time.minute = time.minute - 30
      } else {
        time.minute += 30
      }
      if (time.hour >= 24) {
        time.hour = time.hour - 24
        date.date += 1
      }
      let endDateTime = `2019-${formatDate(date.month)}-${formatDate(date.date)}T${formatDate(time.hour)}:${formatDate(time.minute)}:00`
      const link = `https://myanimelist.net/anime/${anime.id}`
      try {
        var res = await this.calendar.events.insert({
          calendarId: this.calendarId,
          requestBody: {
            end: {
              dateTime: endDateTime,
              timeZone: 'Asia/Tokyo'
            },
            start: {
              dateTime: startDateTime,
              timeZone: 'Asia/Tokyo'
            },
            colorId: anime.color.id,
            description: `<a href="${link}">${link}</a>`,
            summary: `${anime.title} #1 (${anime.channel})`
          }
        })
        console.log(`Added ${anime.title} to calendar at ${anime.startDate} ${anime.onair}`)
      } catch (e) {
        await getAnswer(`Anime "${anime.title}" error\nContinue?\n\n${e}`)
      }
      await sleep(1500)
      response.push({
        calendarResult: res
      })
    }
    return response
  }
}

function getAnswer (question, defaultAnswer) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      if (!answer && defaultAnswer) {
        return resolve(defaultAnswer)
      }
      resolve(answer)
    })
  })
}

function parseAnimeData (anime) {
  const animeData = anime.match(/^(.+?)\s?(?::|：)? ([0-9]{2}\/[0-9]{2}) ([0-9]{2}:[0-9]{2}) (\d+) (.+)$/i)
  return {
    id: Number(animeData[4]),
    channel: animeData[1],
    startDate: animeData[2],
    onair: animeData[3],
    title: animeData[5],
    color: findColor(animeData[1])
  }
}

const flatten = (arr, depth = 1) => arr.reduce((a, v) => a.concat(depth > 1 && Array.isArray(v) ? flatten(v, depth - 1) : v), [])

function findColor (channel) {
  try {
    return colors[Object.keys(colors).map(el => ({ key: el, lowerCase: el.toString().toLowerCase() })).find(el => el.lowerCase === channel.toLowerCase()).key]
  } catch (e) {
    return colors['other']
  }
}

const { parseInt } = Number

const parseTime = time => {
  const parsed = time.match(/([0-9]+):([0-9]+)/i)
  return {
    hour: parseInt(parsed[1]),
    minute: parseInt(parsed[2])
  }
}
const parseDate = date => {
  const parsed = date.match(/([0-9]+)\/([0-9]+)/i)
  return {
    date: parseInt(parsed[2]),
    month: parseInt(parsed[1])
  }
}
const formatDate = data => data.toString().length < 2 ? `0${data}` : data

const sleep = timeout => new Promise(resolve => setTimeout(resolve, timeout))

function getArgv (name) {
  const id = process.argv.indexOf(name)
  if (id !== -1) {
    return process.argv[id + 1]
  }
  return undefined
}
