import 'dotenv/config'
import {Client} from '@notionhq/client'
import {VersesDataSchema} from './schemas.js'
import {readJsonSync} from 'fs-extra/esm'

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
const GROUPED_BLOCK_SIZE = 1000
const GROUP_RICH_TEXT_SIZE = 100
const MAX_RETRY_COUNT = 10
const RETRY_WAIT_TIME = 2000
const esvBible = VersesDataSchema.parse(
  readJsonSync('./data/esv/versesData.json')
)
const nasbBible = VersesDataSchema.parse(
  readJsonSync('./data/nasb/versesData.json')
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

// Kick off the process.
processBible(esvBible, process.env.ESV_ID)
// processBible(nasb, process.env.ESV_ID)

function processBible(bible, databaseId) {
  const biblePromise = [bible.ot, bible.nt].reduce(
    (acc, testament, testamentIdx) => {
      const testamentPromiseFxn = () => {
        return testament.reduce((acc, book) => {
          const bookIdx =
            testament.findIndex(item => item.bookName === book.bookName) +
            (testamentIdx ? bible.ot.length : 0)

          return acc.then(() => {
            console.log(`PROCESSING ${book.bookName}...`)
            return processBook(
              book,
              bookIdx + 1,
              testamentIdx ? 'NT' : 'OT',
              databaseId
            )
          })
        }, Promise.resolve())
      }

      return acc.then(testamentPromiseFxn)
    },
    Promise.resolve()
  )

  return biblePromise
}

function processBook(book, bookIdx, testament, databaseId) {
  const {bookName, chapters} = book

  const requestsData = chapters.reduce((acc, {title, verses}, idx) => {
    /**
     * This is an array of all the verses in a single chapter. The format is a
     * bold verse number and a space between the verse text.
     */
    const totalRichTextObjects = verses.reduce(
      (acc, {verse, text}, verseIdx) => {
        const isLastVerse = verseIdx === verses.length - 1

        // The bold verse number.
        acc.push({
          type: 'text',
          text: {content: `${verse} `},
          annotations: {bold: true},
        })

        // The verse text.
        acc.push({
          type: 'text',
          text: {content: isLastVerse ? text : `${text} `},
        })
        return acc
      },
      []
    )

    /**
     * Notion limits the amount of rich text objects to 100, so we have to group
     * 100 verses together in a single block.
     */
    const groupedRichTextObjects = splitArrayIntoChunks(
      totalRichTextObjects,
      GROUP_RICH_TEXT_SIZE
    )

    /**
     * Create blocks for every verse in the chapter. Each verse will be it's own
     * block.
     */
    const totalBlocks = groupedRichTextObjects.map(richTextObjects => {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {rich_text: richTextObjects}, // Object array of 100.
      }
    })

    /**
     * Notion limits the total number of blocks in a single request to 1000.
     */
    const groupedBlocks = splitArrayIntoChunks(totalBlocks, GROUPED_BLOCK_SIZE)

    /**
     * Add chunks of blocks to the accumulator. Each chunk represents a single
     * request to the Notion API. By this point, we've stayed within the limits
     * for a single request and maxed it out.
     */
    groupedBlocks.forEach(children => {
      acc.push({
        parent: {database_id: databaseId},
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

  /**
   * Notion limits the amount of requests to 3 per second. We will look to fire
   * 3 requests at a time per internal, which will be just over a second to stay
   * within the limits.
   */
  const requestsDataChunks = splitArrayIntoChunks(requestsData, 3)

  /**
   * Wrap each chunk of requests in a function which returns a promise so that
   * we can throttle the amount of requests being made. When promises are
   * created they are immediately executed, so by wrapping them in functions we
   * can control the flow.
   */
  const requestPromiseFxns = requestsDataChunks.map(chunkOfRequestsData => {
    return () => {
      const chunkOfRequests = chunkOfRequestsData.map(data => {
        let retryCount = 0

        /**
         * The Notion API can fail sporadically at times. This retry function
         * will both retry a number of times as well as insert a pause half way
         * through the retries just to "reset" any throttling the API might do.
         */
        function keepTrying() {
          return notion.pages.create(data).catch(e => {
            retryCount++

            if (retryCount === MAX_RETRY_COUNT) {
              const pageTitle = data.properties.Name.title[0].text.content
              console.log('FAILED REQUEST:', pageTitle, e)
              process.exit()
            } else if (Math.ceil(retryCount / 2)) {
              console.log(`retrying ${retryCount} and waiting a bit...`)
              return wait(RETRY_WAIT_TIME).then(keepTrying)
            } else {
              console.log(`retrying ${retryCount}...`)
              return keepTrying()
            }
          })
        }

        return keepTrying()
      })

      /**
       * Return a promise that resolves after 2 conditions:
       * 1. The 3 requests are complete
       * 2. A specified amount of time has passed
       */

      return Promise.all([chunkOfRequests, wait(getWaitTime())])
    }
  })

  const promiseChain = requestPromiseFxns.reduce(
    (acc, fxn, idx, arr) =>
      acc
        .then(fxn)
        .then(() => console.log(`${idx + 1} of ${arr.length} completed`)),
    Promise.resolve()
  )

  return promiseChain
}

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

function getWaitTime() {
  return getRandomNumber(1100, 1300)
}

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
