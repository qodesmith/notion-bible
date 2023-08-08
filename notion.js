import 'dotenv/config'
import {Client} from '@notionhq/client'

const notion = new Client({auth: process.env.NOTION_TOKEN})

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

const response = notion.pages.create({
  parent: {
    database_id: process.env.ESV_ID,
  },
  properties: {
    Name: {
      type: 'title',
      title: [
        {
          type: 'text',
          text: {
            content: 'Test content',
          },
        },
      ],
    },
    Chapter: {
      type: 'number',
      number: 2,
    },
    Book: {
      select: {
        name: 'Genesis',
        color: 'yellow',
      },
    },
    'Book Index': {
      type: 'number',
      number: 1,
    },
    Testament: {
      select: {
        name: 'OT',
        color: 'pink',
      },
    },
  },
  children: [
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: 'Paragraph 1, rich_text 1.',
            },
          },
          {
            type: 'text',
            text: {
              content: 'Paragraph 1, rich_text 2.',
            },
          },
        ],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: 'Paragraph 2, rich_text 1.',
            },
          },
          {
            type: 'text',
            text: {
              content: 'Paragraph 2, rich_text 2.',
            },
          },
        ],
      },
    },
  ],
})

response
  .then(res => {
    console.log(res)
  })
  .catch(err => {
    console.log('ERROR:', err)
  })
