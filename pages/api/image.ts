// pages/api/random_color_image.ts
import { NextApiRequest, NextApiResponse } from 'next'
import path from 'path'
import fs from 'fs'
import AdmZip from 'adm-zip'

const getRandomImageFromZip = async (zipPath: string) => {
  const zip = new AdmZip(zipPath)
  const dataFolder = 'data/'
  const dataEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith(dataFolder) && !entry.isDirectory)

  if (!dataEntries.length) {
    throw new Error('No images found in the data folder of the zip file')
  }

  const randomIndex = Math.floor(Math.random() * dataEntries.length)
  const randomEntry = dataEntries[randomIndex]
  return randomEntry.getData()
}

const randomImageFromZip = async (req: NextApiRequest, res: NextApiResponse) => {
  const zipPath = path.join(process.cwd(), 'assets', 'arcadians.ora')

  if (!fs.existsSync(zipPath)) {
    res.status(404).json({ error: 'ZIP file not found' })
    return
  }

  try {
    const imageBuffer = await getRandomImageFromZip(zipPath)
    res.setHeader('Content-Type', 'image/png')
    res.status(200).send(imageBuffer)
  } catch (error) {
    console.error('Error getting random image from ZIP:', error)
    res.status(500).json({ error: 'Error getting random image from ZIP' })
  }
}

export default randomImageFromZip
