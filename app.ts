import express, {NextFunction, Request, Response} from "express";
import {Webhook, WebhookUnbrandedRequiredHeaders, WebhookVerificationError} from "standardwebhooks"
import {RenderEvent, RenderService, WebhookPayload} from "./render";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    MessageActionRowComponentBuilder
} from "discord.js";

const app = express();
const port = process.env.PORT || 3001;
const renderWebhookSecret = process.env.RENDER_WEBHOOK_SECRET || '';
if (!renderWebhookSecret ) {
    console.error("Error: RENDER_WEBHOOK_SECRET is not set.");
    process.exit(1);
}


const renderAPIURL = process.env.RENDER_API_URL || "https://api.render.com/v1"

// To create a Render API key, follow instructions here: https://render.com/docs/api#1-create-an-api-key
const renderAPIKey = process.env.RENDER_API_KEY || '';
if (!renderAPIKey ) {
    console.error("Error: RENDER_API_KEY is not set.");
    process.exit(1);
}

const discordToken = process.env.DISCORD_TOKEN || '';
if (!discordToken ) {
    console.error("Error: DISCORD_TOKEN is not set.");
    process.exit(1);
}
const discordChannelID = process.env.DISCORD_CHANNEL_ID || '';
if (!discordChannelID ) {
    console.error("Error: DISCORD_CHANNEL_ID is not set.");
    process.exit(1);
}

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, readyClient => {
    console.log(`Discord client setup! Logged in as ${readyClient.user.tag}`);
});

// Log in to Discord with your client's token
client.login(discordToken).catch(err => {
    console.error(`unable to connect to Discord: ${err}`);
});

app.post("/webhook", express.raw({type: 'application/json'}), (req: Request, res: Response, next: NextFunction) => {
    try {
        validateWebhook(req);
    } catch (error) {
        return next(error)
    }

    const payload: WebhookPayload = JSON.parse(req.body)

    res.status(200).send({}).end()

    // handle the webhook async so we don't timeout the request
    handleWebhook(payload)
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    if (err instanceof WebhookVerificationError) {
        res.status(400).send({}).end()
    } else {
        res.status(500).send({}).end()
    }
});

const server = app.listen(port, () => console.log(`Example app listening on port ${port}!`));

function validateWebhook(req: Request) {
    const headers: WebhookUnbrandedRequiredHeaders = {
        "webhook-id": req.header("webhook-id") || "",
        "webhook-timestamp": req.header("webhook-timestamp") || "",
        "webhook-signature": req.header("webhook-signature") || ""
    }

    const wh = new Webhook(renderWebhookSecret);
    wh.verify(req.body, headers);
}

async function handleWebhook(payload: WebhookPayload) {
    try {
        switch (payload.type) {
            case "server_failed":
                const service = await fetchServiceInfo(payload)
                const event = await fetchEventInfo(payload)

                console.log(`sending discord message for ${service.name}`)
                await sendServerFailedMessage(service, event.details.reason)
                return
            default:
                console.log(`unhandled webhook type ${payload.type} for service ${payload.data.serviceId}`)
        }
    } catch (error) {
        console.error(error)
    }
}

async function sendServerFailedMessage(service: RenderService, failureReason: any) {
    const channel = await client.channels.fetch(discordChannelID);
    if (!channel ){
        throw new Error(`unable to find specified Discord channel ${discordChannelID}`);
    }

    const isSendable = channel.isSendable()
    if (!isSendable) {
        throw new Error(`specified Discord channel ${discordChannelID} is not sendable`);
    }

    let description = "Failed for unknown reason"
    if (failureReason.nonZeroExit) {
        description = `Exited with status ${failureReason.nonZeroExit}`
    } else if (failureReason.oomKilled) {
        description = `Out of Memory`
    } else if (failureReason.timedOutSeconds) {
        description = `Timed out ` + failureReason.timedOutReason
    } else if (failureReason.unhealthy) {
        description = failureReason.unhealthy
    }

    const embed = new EmbedBuilder()
        .setColor(`#FF5C88`)
        .setTitle(`${service.name} Failed`)
        .setDescription(description)
        .setURL(service.dashboardUrl)

    const logs = new ButtonBuilder()
        .setLabel("View Logs")
        .setURL(`${service.dashboardUrl}/logs`)
        .setStyle(ButtonStyle.Link);
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(logs);

    channel.send({embeds: [embed], components: [row]})
}

// fetchEventInfo fetches the event that triggered the webhook
// some events have additional information that isn't in the webhook payload
// for example, deploy events have the deploy id
async function fetchEventInfo(payload: WebhookPayload): Promise<RenderEvent> {
    const res = await fetch(
        `${renderAPIURL}/events/${payload.data.id}`,
        {
            method: "get",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${renderAPIKey}`,
            },
        },
    )
    if (res.ok) {
        return res.json()
    } else {
        throw new Error(`unable to fetch event info; received code :${res.status.toString()}`)
    }
}

async function fetchServiceInfo(payload: WebhookPayload): Promise<RenderService> {
    const res = await fetch(
        `${renderAPIURL}/services/${payload.data.serviceId}`,
        {
            method: "get",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${renderAPIKey}`,
            },
        },
    )
    if (res.ok) {
        return res.json()
    } else {
        throw new Error(`unable to fetch service info; received code :${res.status.toString()}`)
    }
}

process.on('SIGTERM', () => {
    console.debug('SIGTERM signal received: closing HTTP server')
    server.close(() => {
        console.debug('HTTP server closed')
    })
})
