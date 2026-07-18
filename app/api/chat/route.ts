import { loadChatMessages, saveChatMessages } from "@/features/ai/actions/chat-store";
import { getChatModel } from "@/features/ai/utils/model";
import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse, smoothStream, stepCountIs, streamText, toUIMessageStream, type UIMessage } from "ai";
import { chatTools } from "@/features/ai/tools";


export async function POST(req: Request) {
    await auth.protect();

    const { message, id }: { message: UIMessage, id: string } = await req.json();

    if (!message || !id) {
        return new Response("Missing message or conversation id", { status: 400 });
    }

    const user = await requireUser();

    const conversation = await prisma.conversation.findFirst({
        where: {
            id,
            userId: user.id
        }
    });

    if (!conversation) {
        return new Response("Conversation not found", { status: 404 });
    }

    const previousMessages = await loadChatMessages(id);

    const alreadySaved = previousMessages.some(
        (storedMessage)=>storedMessage.id === message.id
    )

    const messages = alreadySaved ? previousMessages : [...previousMessages, message];

    if(!alreadySaved){
        await saveChatMessages(id, [message]);
    }

    
    try {
        const result = streamText({
            model: getChatModel(conversation.model),
            system: conversation.systemPrompt ?? "You are AskGPT , a helpful assistant",
            messages: await convertToModelMessages(messages),
            tools: chatTools,
            stopWhen: stepCountIs(5),
            maxRetries: 2,

            experimental_transform: smoothStream({
                delayInMs: 20,
                chunking: "word",
            }),
        });

        result.consumeStream();

        return createUIMessageStreamResponse({
            stream: toUIMessageStream({
                stream: result.stream,
                originalMessages: messages,
                generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
                onEnd: async ({ messages: finalMessages }) => {
                    try {
                        await saveChatMessages(id, finalMessages, { updateTitle: false })
                    } catch (error) {
                        console.error(error);
                    }
                }
            })
        })
    } catch (error: unknown) {
        console.error("[chat] API error:", error);

        const statusCode = (error as { statusCode?: number })?.statusCode;
        const errorMessage = (error as { message?: string })?.message ?? "An unexpected error occurred";

        // Rate limit (429) — tell the client to wait and retry
        if (statusCode === 429) {
            const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
            const retryAfter = retryMatch ? Math.ceil(Number(retryMatch[1])) : 60;

            return Response.json(
                {
                    error: "Rate limit exceeded. You've hit the Gemini API free tier limit (20 requests/day). Please wait and try again, or upgrade your API plan.",
                    retryAfter,
                },
                {
                    status: 429,
                    headers: { "Retry-After": String(retryAfter) },
                }
            );
        }

        return Response.json(
            { error: errorMessage },
            { status: statusCode || 500 }
        );
    }

}