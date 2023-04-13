// pages/api/random_color_image.ts
import { NextApiRequest, NextApiResponse } from 'next'
import path from 'path'
import fs from 'fs'
import AdmZip from 'adm-zip'
import sharp from 'sharp'
import xml2js from 'xml2js'

type LayerInfo = {
    src: string;
    name: string;
    visibility: string;
    x: string;
    y: string;
  };

type ImageBufferWithOffset = {
buffer: Buffer;
x: number;
y: number;
};
  

const getImageSizeFromXml = async (xmlBuffer: Buffer) => {
    const parser = new xml2js.Parser()
    const xmlString = xmlBuffer.toString()
  
    const result = await parser.parseStringPromise(xmlString)
    const imageComponent = result?.image

    if (!imageComponent) {
      throw new Error('No image component found in stack.xml')
    }
  
    const width = parseInt(imageComponent.$.w, 10)
    const height = parseInt(imageComponent.$.h, 10)
  
    return { width, height }
  }


  const getStackNamesFromRootNode = (rootNode: any) => {
    const stackChildren = rootNode.stack
  
    if (!stackChildren) {
      return []
    }
  
    const stackNames: string[] = stackChildren.map((stack: any) => stack.$.name)
    return stackNames
  }

  const findLayerStack = (component: any, targetLayerName: string): any => {

    if (component.$.name === targetLayerName) {
      return component
    }
  
    if (component.stack) {
      for (const childStack of component.stack) {
        const result = findLayerStack(childStack, targetLayerName)
        if (result) {
          return result
        }
      }
    }
  
    return null
  }
  
  const getLayersFromXml = async (xmlBuffer: Buffer) => {
    const parser = new xml2js.Parser()
    const xmlString = xmlBuffer.toString()
  
    const result = await parser.parseStringPromise(xmlString)
    const rootNode = result?.image.stack[0].stack[0] // assumes a parent Root layer in the ORA file
  
    if (!rootNode) {
      throw new Error('Root node not found in stack.xml')
    }
  
    const stackNames = getStackNamesFromRootNode(rootNode)
  
    const allLayerInfoArray: Array<LayerInfo> = []
  
    for (const targetLayerName of stackNames) {
      const targetStack = findLayerStack(rootNode, targetLayerName)
  
      if (!targetStack) {
        continue
      }
  
      const layerComponents = targetStack.layer
  
      const layerInfoArray: Array<LayerInfo> = layerComponents
      .map((layer: any) => ({
        src: layer.$.src,
        name: layer.$.name,
        visibility: layer.$.visibility,
        x: layer.$.x,
        y: layer.$.y
      }))
      .filter((layer: LayerInfo) => layer.visibility === 'visible')

  
      if (layerInfoArray.length > 0) {
        for (var i = 0; i < layerInfoArray.length; i++) {
            allLayerInfoArray.push(layerInfoArray[i])
        }
      }
    }
  
    return allLayerInfoArray
  }

  

const getRandomImageFromZip = async (zipPath: string) => {
  const zip = new AdmZip(zipPath)
  const dataFolder = 'data/'
  const dataEntries = zip
    .getEntries()
    .filter((entry) => entry.entryName.startsWith(dataFolder) && !entry.isDirectory)

  if (!dataEntries.length) {
    throw new Error('No images found in the data folder of the zip file')
  }

  const randomIndex = Math.floor(Math.random() * dataEntries.length)
  const randomEntry = dataEntries[randomIndex]
  return randomEntry.getData()
}

const combineImages = async (
    imageBuffersWithOffsets: ImageBufferWithOffset[],
    combinedWidth: number,
    combinedHeight: number
  ) => {
    let compositeImage = await sharp({
      create: {
        width: combinedWidth,
        height: combinedHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });
  
    const compositeOperations = imageBuffersWithOffsets.map((imageBufferWithOffset) => ({
      input: imageBufferWithOffset.buffer,
      left: imageBufferWithOffset.x,
      top: imageBufferWithOffset.y,
    }));
  
    compositeImage = await compositeImage.composite(compositeOperations).png();
  
    return compositeImage.toBuffer();
  };
  
  const selectImagesFromZip = async (zipPath: string, partsArray: Array<{ src: string; name: string; visibility: string, x: string, y: string }>) => {
    const zip = new AdmZip(zipPath);
    const imageBuffersWithOffsets  = [];
  
    for (const part of partsArray) {
      const entry = zip.getEntry(part.src);
      if (!entry.isDirectory) {
        var layer : ImageBufferWithOffset = {buffer: entry.getData(), x: parseInt(part.x), y: parseInt(part.y)};

        imageBuffersWithOffsets .push({
            buffer: entry.getData(), x: parseInt(part.x), y: parseInt(part.y)
        });
      }
    }
  
    return imageBuffersWithOffsets ;
  };  

  const renderOraImage = async (req: NextApiRequest, res: NextApiResponse) => {
    const zipPath = path.join(process.cwd(), 'assets', 'arcadians.ora');
  
    if (!fs.existsSync(zipPath)) {
      res.status(404).json({ error: 'ZIP file not found' });
      return;
    }
  
    try {
      const zip = new AdmZip(zipPath);
      const stackXmlEntry = zip.getEntry('stack.xml');
      const stackXmlBuffer = stackXmlEntry.getData();
      const partsArray = (await getLayersFromXml(stackXmlBuffer)).reverse();    
      const { width, height } = await getImageSizeFromXml(stackXmlBuffer);
      const imageBuffers = await selectImagesFromZip(zipPath, partsArray);
  
      if (imageBuffers.length < 2) {
        res.status(400).json({ error: 'Not enough images in the selected partsArray to combine' });
        return;
      }
  
      const combinedImageBuffer = await combineImages(imageBuffers, width, height);
        
      res.setHeader('Content-Type', 'image/png');
      res.status(200).send(combinedImageBuffer);
    } catch (error) {
      console.error('Error getting images from ZIP and combining them:', error);
      res.status(500).json({ error: 'Error getting images from ZIP and combining them' });
    }
  };
  
  export default renderOraImage;

