import { NextRequest, NextResponse } from 'next/server';

interface TelegramUpdate {
  callback_query?: {
    id: string;
    data: string;
    message: {
      message_id: number;
      chat: {
        id: number;
      };
      caption?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!supabaseUrl || !supabaseServiceKey || !telegramBotToken) {
    return NextResponse.json({ ok: true });
  }

  // Verify webhook secret if configured
  if (webhookSecret) {
    const requestSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (requestSecret !== webhookSecret) {
      console.warn('Telegram webhook: invalid secret token');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const update: TelegramUpdate = await request.json();

    // Handle callback query (button press)
    if (update.callback_query) {
      const { id: callbackId, data, message } = update.callback_query;
      const [action, posterId] = data.split(':');

      if (!posterId || (action !== 'approve' && action !== 'reject')) {
        return NextResponse.json({ ok: true });
      }

      // Get current poster status
      const getResponse = await fetch(
        `${supabaseUrl}/rest/v1/posters?id=eq.${posterId}&select=status`,
        {
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
        }
      );

      if (!getResponse.ok) {
        return NextResponse.json({ ok: true });
      }

      const [poster] = await getResponse.json();
      if (!poster) {
        return NextResponse.json({ ok: true });
      }

      // Determine new status
      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      // Update poster status
      await fetch(
        `${supabaseUrl}/rest/v1/posters?id=eq.${posterId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: newStatus,
            moderated_at: new Date().toISOString(),
          }),
        }
      );

      // Answer callback query
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: newStatus === 'approved' ? 'Approved!' : 'Rejected',
        }),
      });

      // Update message with new buttons showing status
      const statusEmoji = newStatus === 'approved' ? '✅' : '❌';
      const statusText = newStatus === 'approved' ? 'Approved' : 'Rejected';

      await fetch(`https://api.telegram.org/bot${telegramBotToken}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          message_id: message.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: `${statusEmoji} ${statusText}`, callback_data: 'noop' }],
            ],
          },
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
