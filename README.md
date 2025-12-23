# Random SVG

A Next.js web application that displays random SVG images from various sources across the web.

## Features

- Fetches random SVG images from freesvg.org
- Beautiful, responsive UI built with Tailwind CSS
- Dark mode support
- Download SVG files directly
- Link to original source

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

1. The app fetches a random page from freesvg.org (pages 1-2132)
2. Parses the HTML to find all SVG preview links on that page
3. Randomly selects one of the previews
4. Navigates to the detail page and extracts the SVG download link
5. Fetches and displays the SVG content

## Future Enhancements

- Add more SVG sources beyond freesvg.org
- Implement caching to improve performance
- Add ability to favorite SVGs
- Share functionality
- Category filtering

## License

MIT
