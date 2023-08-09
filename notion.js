import 'dotenv/config'
import {Client} from '@notionhq/client'
import {VersesDataSchema} from './schemas.js'
import {readJsonSync, writeJsonSync} from 'fs-extra/esm'

/**
 * ❓❓❓ Where can I find my database ID?
 * https://developers.notion.com/docs/working-with-databases
 *
 * Example Notion databse URL structure:
 * https://www.notion.so/{workspace_name}/{database_id}?v={view_id}
 *
 * 💡 Note - database IDs returned from the API will have hyphens in them
 * (UUIDv4). You can use either version of the ID with the API.
 *
 * ----------------------------------------------------------------------------
 *
 * ❓❓❓ What are the API rate limits?
 * https://developers.notion.com/reference/request-limits
 *
 * Of concern to this project:
 * - 1000 blocks - single request max
 * - 500kb - overall single request
 * - 2000 characters => rich text object `text.content`
 * - 100 elements => array of rich text objects
 */

const notion = new Client({auth: process.env.NOTION_TOKEN})
const WAIT_TIME = 1100
const GROUPED_BLOCK_SIZE = 1000
const GROUP_RICH_TEXT_SIZE = 100
const esvBible = VersesDataSchema.parse(
  readJsonSync('./data/esv/versesData.json')
)
const notionColors = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
]

// Genesis, Leviticus
;[esvBible.ot[0], esvBible.ot[1]].reduce((acc, book, i) => {
  const bookColor = notionColors[(i + 1) % notionColors.length]

  console.log(book.bookName, bookColor)
  return acc.then(() => processBook(book, i + 1, 'OT'))
}, Promise.resolve())

function processBook(book, bookIdx, testament) {
  const {bookName, chapters} = book

  const requestsData = chapters.reduce((acc, {title, verses}, idx) => {
    /**
     * This is an array of all the verses in a single chapter. The format is a
     * bold verse number and a space between the verse text.
     */
    const totalRichTextObjects = verses.reduce((acc, {verse, text}) => {
      // The bold verse number.
      acc.push({
        type: 'text',
        text: {content: `${verse} `},
        annotations: {bold: true},
      })

      // The verse text.
      acc.push({type: 'text', text: {content: text}})
      return acc
    }, [])

    /**
     * Notion limits the amount of rich text objects to 100, so we have to group
     * 100 verses together in a single block.
     */
    const groupedRichTextObjects = splitArrayIntoChunks(
      totalRichTextObjects,
      GROUP_RICH_TEXT_SIZE
    )

    const totalBlocks = groupedRichTextObjects.map(richTextObjects => {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {rich_text: richTextObjects}, // Object array of 100.
      }
    })

    const groupedBlocks = splitArrayIntoChunks(totalBlocks, GROUPED_BLOCK_SIZE)

    groupedBlocks.forEach(children => {
      acc.push({
        parent: {database_id: process.env.ESV_ID},
        properties: {
          Name: {
            type: 'title',
            title: [
              {
                type: 'text',
                text: {
                  content: title,
                },
              },
            ],
          },
          Chapter: {
            type: 'number',
            number: idx + 1,
          },
          Book: {
            select: {
              name: bookName,
              color: notionColors[bookIdx % notionColors.length],
            },
          },
          'Book Index': {
            type: 'number',
            number: bookIdx,
          },
          Testament: {
            select: {
              name: testament,
              color: testament === 'OT' ? 'purple' : 'blue',
            },
          },
        },
        children,
      })
    })

    return acc
  }, [])

  const requestsChunks = splitArrayIntoChunks(requestsData, 3)
  const promisesToExecute = requestsChunks.reduce(
    (acc, chunkOfRequests, chunkIdx) => {
      const notionPromises = chunkOfRequests.map(data =>
        notion.pages.create(data)
      )
      const notionPromise = Promise.allSettled(notionPromises).then(results => {
        let hasFailure = false

        console.log('CHUNK', chunkIdx)

        results.forEach(({status, value, reason}, resultIdx) => {
          if (status === 'rejected') hasFailure = true

          const title =
            chunkOfRequests[resultIdx].properties.Name.title[0].text.content
          console.log(status, title)

          if (hasFailure) {
            console.log('FAILURE REASON:', reason)
            // console.log(
            //   'FAILED REQUEST DATA:',
            //   JSON.stringify(chunkOfRequests[resultIdx], null, 2)
            // )
          }
        })

        console.log('-'.repeat(100))
        if (hasFailure) process.exit()
      })
      const iterationPromise = Promise.all([notionPromise, wait(WAIT_TIME)])

      return acc.then(() => iterationPromise)
    },
    Promise.resolve()
  )

  return promisesToExecute
}

// writeJsonSync('./temp-requests.json', requests, {spaces: 2})

/**
 * @param {any[]} arr
 * @param {number} chunkSize
 */
function splitArrayIntoChunks(arr, chunkSize) {
  const result = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize))
  }
  return result
}

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
