import {Octokit} from "@octokit/core";
import express, {NextFunction, Request, Response} from "express";
import {Webhook, WebhookUnbrandedRequiredHeaders, WebhookVerificationError} from "standardwebhooks"
import {RenderDeploy, RenderEvent, RenderService, WebhookPayload} from "./render";


// Require the necessary discord.js classes
import {Client, Events, GatewayIntentBits} from "discord.js";

const app = express();
const port = process.env.PORT || 3001;
const renderWebhookSecret = process.env.RENDER_WEBHOOK_SECRET || '';

const renderAPIURL = process.env.RENDER_API_URL || "https://api.render.com/v1"

// To create a Render API token, follow instructions here: https://render.com/docs/api#1-create-an-api-key
const renderAPIToken = process.env.RENDER_API_TOKEN || '';

const discordToken = process.env.DISCORD_TOKEN || '';
const discordChannelID = process.env.DISCORD_CHANNEL_ID || '';

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, readyClient => {
    console.log(`Discord client setup! Logged in as ${readyClient.user.tag}`);
});

// Log in to Discord with your client's token
client.login(discordToken);

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
                const event = await fetchEventInfo(payload)

                const deploy = await fetchDeployInfo(payload.data.serviceId, event.details.deployId)
                if (!deploy.commit) {
                    console.log(`ignoring deploy success for image backed service: ${payload.data.serviceId}`)
                    return
                }

                const service = await fetchServiceInfo(payload)

                console.log(`sending discord message for ${service.name}`)
                await sendMessage(service.name, service.branch)
                return
            default:
                console.log(`unhandled webhook type ${payload.type} for service ${payload.data.serviceId}`)
        }
    } catch (error) {
        console.error(error)
    }
}

async function sendMessage(serviceName: string, branch: string) {
    const channel = client.channels.cache.get(discordChannelID);
    if (!channel ){
        throw new Error(`unable to find specified Discord channel ${discordChannelID}`);
    }

    const isSendable = channel.isSendable()
    if (!isSendable) {
        throw new Error(`specified Discord channel ${discordChannelID} is not sendable`);
    }

    channel.send('content');
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
                Authorization: `Bearer ${renderAPIToken}`,
            },
        },
    )
    if (res.ok) {
        return res.json()
    } else {
        throw new Error(`unable to fetch event info; received code :${res.status.toString()}`)
    }
}

async function fetchDeployInfo(serviceId: string, deployId: string): Promise<RenderDeploy> {
    const res = await fetch(
        `${renderAPIURL}/services/${serviceId}/deploys/${deployId}`,
        {
            method: "get",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${renderAPIToken}`,
            },
        },
    )
    if (res.ok) {
        return res.json()
    } else {
        throw new Error(`unable to fetch deploy info; received code :${res.status.toString()}`)
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
                Authorization: `Bearer ${renderAPIToken}`,
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
