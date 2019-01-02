
const fs = require('fs')
const readline = require('readline')
const {
  google
} = require('googleapis')
const colors = require('./color.json')
const jikanjs = require('jikanjs')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
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
function authorize(credentials, callback) {
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
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
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

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function start(auth) {
  const sheets = google.sheets({
    version: 'v4',
    auth
  })
  const calendar = google.calendar({
    version: 'v3',
    auth
  })
  const sheetsValues = await sheets.spreadsheets.values.get({
    spreadsheetId: '1Ci8F0_nYprQ6DMQ2rTYIN6IeJkxq9JiMkesVLh8WuCk',
    range: 'A2:N7',
  })
  
  let animes = flatten(sheetsValues.data.values.map(el => el.filter(Boolean).map(parseAnimeData)), 1)
  animes = await Promise.all(animes.map(async item => {
    return {
      ...item,
      mal_id: (await jikanjs.search('anime', item.title)).results[0].mal_id
    }
  }))
    // https://calendar.google.com/calendar?cid=cWNlbnRyeTAxQGdtYWlsLmNvbQ
  // console.log(
   const response = await Promise.all(animes.map(async anime => {
    // let anime = animes[0]
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
      // console.log([startDateTime, endDateTime], anime, date, time)
      // return
      return calendar.events.insert({
        calendarId: 'qcentry01@gmail.com',
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
          description: `https://myanimelist.net/anime/${anime.mal_id}`,
          summary: `${anime.title} #1 (${anime.channel})`
        }
        })
      })
    )
      rl.question('delete events? ', async answer => {
        rl.close()
        if (answer === 'y') {
          await Promise.all(
            response.map(el => calendar.events.delete({
              calendarId: 'qcentry01@gmail.com',
              eventId: el.id
            }))
          )
          console.log('done')
        } else {
          process.exit(1)
        }
      })
  // )
}

function parseAnimeData (anime) {
  const animeData = anime.match(/(.+?)\s?(?::|：) ([0-9]{2}\/[0-9]{2}) ([0-9]{2}:[0-9]{2}) (.+)/i)
  return {
    channel: animeData[1],
    startDate: animeData[2],
    onair: animeData[3],
    title: animeData[4],
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