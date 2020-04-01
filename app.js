import { promises as fs, readFileSync } from 'fs'
import { createInterface } from 'readline'
import googleapis from 'googleapis'
import { parseTime, parseDate, sleep, argv, getArgv } from './lib/index.js'
const { google } = googleapis
const colors = JSON.parse(readFileSync('./color.json'))

const config = {}

if (argv('--config')) {
  try {
    const { spreadsheetId, range, calendarId } = JSON.parse(readFileSync(getArgv('--config')))
    config.spreadsheetId = spreadsheetId || null
    config.range = range || null
    config.calendarId = calendarId || null
  } catch (e) {}
}

for (const key in config) {
  console.log(`${key} loaded from ${getArgv('--config') || './default-config.json'}`)
}

const { readFile, writeFile } = fs

const rl = createInterface({
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

const formatDate = data => data.toString().length < 2 ? `0${data}` : data

const proceed = async () => {
  const content = JSON.parse(await readFile('client_secret.json'))
  const oAuth2Client = await authorize(content)

  return start(oAuth2Client)
}
proceed()
  .then(() => {
    process.exit(1)
  })
  .catch(err => {
    console.log(err)
  })
/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 */
async function authorize (credentials) {
  const {
    client_secret,
    client_id,
    redirect_uris
  } = credentials.installed
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  )

  try {
    const token = await readFile(TOKEN_PATH)
    oAuth2Client.setCredentials(JSON.parse(token))
    return oAuth2Client
  } catch (e) {
    return getNewToken(oAuth2Client)
  }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
async function getNewToken (oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  })
  console.log('Authorize this app by visiting this url:', authUrl)
  return getAnswer('Enter the code from that page here: ')
    .then(code => {
      return new Promise((resolve, reject) => {
        oAuth2Client.getToken(code, (err, token) => {
          if (err) return reject(new Error(`Error while trying to retrieve access token ${err}`))
          oAuth2Client.setCredentials(token)
          // Store the token to disk for later program executions
          writeFile(TOKEN_PATH, JSON.stringify(token))
            .then(() => {
              console.log('Token stored to', TOKEN_PATH)
              resolve(oAuth2Client)
            })
            .catch(reject)
        })
      })
    })
  // rl.question('Enter the code from that page here: ', (code) => {
  //   rl.close()
  //   oAuth2Client.getToken(code, (err, token) => {
  //     if (err) return console.error('Error while trying to retrieve access token', err)
  //     oAuth2Client.setCredentials(token)
  //     // Store the token to disk for later program executions
  //     writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
  //       if (err) console.error(err)
  //       console.log('Token stored to', TOKEN_PATH)
  //     })
  //     callback(oAuth2Client)
  //   })
  // })
}

async function start (auth) {
  const spreadsheetId = config.spreadsheetId || await AnimeTransferApp.getSpreadsheetId()
  const range = config.range || await AnimeTransferApp.getRange()
  const calendarId = config.calendarId || await AnimeTransferApp.getCalendarId()
  const app = new AnimeTransferApp({ auth, calendarId, spreadsheetId, range })
  const animes = await app.getAnimes()

  const go = await getAnswer(
    `There's ${animes.length} animes.
  Continue? (enter any value and press enter to terminate)`,
    false
  )
  if (go) {
    console.log('Terminating...')
  }
  const result = await app.addAnimesToCalendar(animes)
  console.log('Done')
  console.log(result)
  return result
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
    const spreadsheetId = argvSheetId || await getAnswer('Gimme spreadsheet id: ')
    if (!spreadsheetId) {
      console.log('no id was given, try again')
      return AnimeTransferApp.getSpreadsheetId(false)
    }
    console.log(`Got sheet id${argv && argvSheetId ? ' from command line' : ''}: ${spreadsheetId}}`)
    return spreadsheetId
  }

  static async getRange (argv = true) {
    if (argv) {
      var argvRangeId = getArgv('--range')
    }
    const range = argvRangeId || await getAnswer('Gimme range for this spreadsheet values (default - A2:H9)(If you want to specify sheet then: "Sheet name"!A2:K9): ', 'A2:H9')
    console.log(`Got range${argv && argvRangeId ? ' from command line' : ''}: ${range}`)
    return range
  }

  static async getCalendarId (argv = true) {
    if (argv) {
      var argvCalendarId = getArgv('--calendarid')
    }
    const calendarId = argvCalendarId || await getAnswer('Gimme calendar id: ')
    if (!calendarId) {
      console.log('no id was given, try again')
      return AnimeTransferApp.getCalendarId(false)
    }
    console.log(`Got calendar id${argv && argvCalendarId ? ' from command line' : ''}: ${calendarId}`)
    return calendarId
  }

  async getAnimes () {
    const sheetsValues = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.range
    })
    return flatten(
      sheetsValues.data.values.map(el => el.filter(Boolean).map(parseAnimeData)),
      1
    )
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
      const startDateTime = `2020-${formatDate(date.month)}-${formatDate(date.date)}T${formatDate(time.hour)}:${formatDate(time.minute)}:00`
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
      const endDateTime = `2020-${formatDate(date.month)}-${formatDate(date.date)}T${formatDate(time.hour)}:${formatDate(time.minute)}:00`
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
        calendarResult: res.data
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
  if (argv('--debug')) {
    console.log('parseAnimeData ', anime)
  }
  const animeData = anime.match(/^(.+?)\s?(?::|：)?\s([0-9]{2}\/[0-9]{2})\s([0-9]{2}:[0-9]{2})\s(\d+)\s(.+)$/im)
  if (argv('--debug')) {
    console.log('parseAnimeData ', animeData)
  }
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
    return colors.other
  }
}
