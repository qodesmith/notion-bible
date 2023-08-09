import {Client} from '@notionhq/client'

// GITHUB ISSUE - https://github.com/makenotion/notion-sdk-js/issues/436
const notion = new Client({auth: process.env.NOTION_TOKEN})
const response = await notion.databases.query({database_id: process.env.ESV_ID})

console.log('RESPONSE:', response)
