# Example to Send a Discord Message from a Render Webhook

This example sends a message to Discord when receiving a server failed webhook.

# Prerequisites
If you haven't already, [sign up for a Render account](https://dashboard.render.com/register).
Creating webhooks on Render requires a Professional plan or higher. You can [view and upgrade your plan](https://dashboard.render.com/billing/update-plan) in the Render Dashboard.

## Deploy to Render

1. Use the button below to deploy to Render </br>
<a href="https://render.com/deploy?repo=https://github.com/render-examples/webhook-discord-bot/tree/main"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render"></a>

2. Follow [instructions](https://render.com/docs/webhooks) to create a webhook with the URL from your service and `/webhook` path
3. Follow [instructions](https://render.com/docs/api#1-create-an-api-key) to create a Render API Key
4. Follow [instructions](https://discord.com/developers/docs/quick-start/getting-started#step-1-creating-an-app) to create a Discord App and copy the token
5. Navigate to the installation settings for your app and
   - add `bot` scope
   - add `SendMessages` and `ViewChannels` permissions
6. Set the following env vars
    - `RENDER_WEBHOOK_SECRET` environment variable to the secret from the webhook created in step 2
    - `RENDER_API_KEY` to the key created in step 3
    - `DISCORD_TOKEN` to the token created in step 4
    - `DISCORD_CHANNEL_ID` to the channel id you want messages sent to

## Developing

Once you've created a project and installed dependencies with `pnpm install`, start a development server:

```bash
pnpm run dev
```

## Building

```bash
pnpm run build
```
