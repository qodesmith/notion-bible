import {object, string, array, number} from 'valibot'

const TestamentSchema = array(
  object({
    bookName: string(),
    chapters: array(
      object({
        title: string(),
        verses: array(
          object({
            verse: number(),
            text: string(),
          })
        ),
      })
    ),
  })
)

export const VersesDataSchema = object({
  version: string(),
  ot: TestamentSchema,
  nt: TestamentSchema,
})
