import { NextRequest, NextResponse } from 'next/server';

interface SubmitPosterBody {
  instagram?: string;
  usedFonts: boolean;
  fontNames?: string[];
  imageBase64: string;
  fileName: string;
  fileType: string;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!supabaseUrl || !supabaseServiceKey || !cloudinaryCloudName) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    const body: SubmitPosterBody = await request.json();
    const { instagram, usedFonts, fontNames, imageBase64, fileName, fileType } = body;

    // Validate required fields
    if (!imageBase64 || !fileName || !fileType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Clean instagram handle
    const cleanInstagram = instagram?.replace('@', '').trim() || null;

    // Upload to Cloudinary
    const publicId = `poster-svg-${Date.now()}`;
    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: imageBase64,
          upload_preset: 'unsigned_posters',
          public_id: publicId,
        }),
      }
    );

    if (!cloudinaryResponse.ok) {
      const errorData = await cloudinaryResponse.text();
      console.error('Cloudinary error:', errorData);
      throw new Error('Failed to upload image');
    }

    const cloudinaryData = await cloudinaryResponse.json();
    const imageUrl = cloudinaryData.secure_url;

    // Insert into Supabase
    const cleanFontNames = fontNames?.filter(f => f.trim()) || [];
    const posterData = {
      instagram: cleanInstagram,
      svg_sources: cleanFontNames, // Reusing svg_sources field for font names
      used_fonts: usedFonts || false,
      used_svg: true,
      image_url: imageUrl,
      status: 'pending',
      source: 'svg',
    };

    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/posters`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(posterData),
      }
    );

    if (!supabaseResponse.ok) {
      const errorData = await supabaseResponse.text();
      console.error('Supabase error:', errorData);
      throw new Error('Failed to save poster');
    }

    const [savedPoster] = await supabaseResponse.json();

    // Send Telegram notification
    if (telegramBotToken && telegramChatId) {
      // Line 1: source
      const sourceLine = usedFonts ? 'svg + dafont' : 'svg';

      // Line 2: author with hyperlink (or anonymous)
      const authorLine = cleanInstagram
        ? `<a href="https://instagram.com/${cleanInstagram}">@${cleanInstagram}</a>`
        : 'anonymous';

      // Line 3: fonts (if usedFonts is true and fontNames provided)
      const fontsLine = usedFonts && cleanFontNames.length > 0
        ? `\n${cleanFontNames.join(', ')}`
        : '';

      const caption = `${sourceLine}\n${authorLine}${fontsLine}`;

      // Send photo with inline keyboard
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          photo: imageUrl,
          caption: caption,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve', callback_data: `approve:${savedPoster.id}` },
                { text: '❌ Reject', callback_data: `reject:${savedPoster.id}` },
              ],
            ],
          },
        }),
      });
    }

    return NextResponse.json(
      { success: true, message: 'Poster submitted for review' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error submitting poster:', error);
    return NextResponse.json(
      { error: 'Failed to submit poster' },
      { status: 500 }
    );
  }
}
