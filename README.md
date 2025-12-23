# Random SVG

A Next.js web application that displays random SVG images from various sources across the web.

## Features

- Fetches random SVG images from multiple sources:
  - freesvg.org
  - publicdomainvectors.org
- Source selection checkboxes (select one or both sources)
- Automatic distribution: 6 images from one source, or 3 from each when both selected
- Beautiful, responsive UI built with Tailwind CSS
- Download button overlay on hover for each image
- Click on image to visit original source page

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Cheerio (for web scraping)

## Getting Started

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Deployment

This project is configured for deployment on Vercel:

1. Push your code to GitHub
2. Import the repository in Vercel
3. Deploy

## How It Works

### freesvg.org Source
1. Fetches a random page from freesvg.org (pages 1-2132)
2. Parses the HTML to find all SVG preview items
3. Randomly selects one and navigates to its detail page
4. Extracts high-quality PNG preview and download link
5. Returns preview image for display

### publicdomainvectors.org Source
1. Fetches a random page from publicdomainvectors.org (pages 38-788)
2. Parses the HTML to find all vector items in the grid
3. Randomly selects one and navigates to its detail page
4. Extracts PNG preview from the main image section
5. Extracts SVG download link from the download button
6. Returns preview image and direct download link

## Future Enhancements

- Add more SVG sources
- Implement caching to improve performance
- Add ability to favorite SVGs
- Share functionality
- Category filtering
- Search functionality

## License

MIT
