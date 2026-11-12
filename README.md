# Random SVG

A Next.js web application that displays random SVG images from various sources across the web.

## Features

- Fetches random SVG images from multiple sources:
  - freesvg.org
  - publicdomainvectors.org
  - Wikimedia Commons (live browser search, with server and local archive fallbacks)
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
1. Discovers the current pagination range from freesvg.org (cached for an hour), then fetches a random page
2. Finds free SVG cards by their thumbnail URLs, excluding paid stock adverts
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

### Wikimedia Commons Source
1. The browser makes one CORS request for the whole selection using `generator=search`, `gsrsort=random`, and `prop=imageinfo`.
2. Original SVGs up to 2 MB load directly from Wikimedia, avoiding thumbnail conversion and Vercel's shared outbound IP.
3. If the browser API is unavailable, `/api/random-svg-wikimedia?count=1..6` tries the server API and then fills missing slots from the local archive. Omitting `count` preserves the single-item response.
4. HTTP 429/503 and API rate-limit errors respect `Retry-After`. Browser API, server API and individual image errors are independent: an archive response or a broken image does not disable future live searches.
5. A failed image tries the server proxy and then an archive replacement for that card only. Downloads also try the browser first.

Requests identify the application using Wikimedia's [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy). Batching follows [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).

Run parser and Wikimedia recovery tests with `npm test` (Node.js 22.18+).

## Future Enhancements

- Add more SVG sources
- Implement caching to improve performance
- Add ability to favorite SVGs
- Share functionality
- Category filtering
- Search functionality

## License

MIT
