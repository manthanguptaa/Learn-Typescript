import { openai } from "@ai-sdk/openai";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createVectorQueryTool, MDocument } from "@mastra/rag";
import { PgVector } from "@mastra/pg";
import fetch from 'node-fetch';
import { embedMany } from "ai";
import dotenv from 'dotenv';
import { LibSQLStore } from '@mastra/libsql';
dotenv.config();

console.log(process.env.POSTGRES_CONNECTION_STRING);

// Initialize PgVector first
const pgVector = new PgVector({ 
    connectionString: process.env.POSTGRES_CONNECTION_STRING! 
});

// Create vector query tool
const vectorQueryTool = createVectorQueryTool({
    vectorStoreName: "pgVector",
    indexName: "embeddings",
    model: openai.embedding("text-embedding-3-small"),
});

// Create the agent
export const ragAgent = new Agent({
    name: "RAG Agent",
    instructions:
      "Mastra is an AI Typescript framework for building AI agents. You are a specialized assistant focused on helping developers understand and use the Mastra framework. When answering questions, use the provided documentation context to give accurate, practical guidance about Mastra's features, APIs, and best practices. Focus on explaining key concepts clearly and providing relevant code examples that demonstrate proper usage. If discussing agents, workflows, or other Mastra components, explain their purpose and how they fit into the broader framework. Keep responses well-structured and technically precise while remaining accessible to developers new to Mastra. You have access to the following tools: vectorQueryTool",
    model: openai("gpt-4o-mini"),
    tools: {
      vectorQueryTool,
    },
});

// Initialize Mastra with both agent and vector store
export const mastra = new Mastra({
    agents: { ragAgent },
    vectors: { pgVector },
    storage: new LibSQLStore({
        url: "file:./mastra.db",
    })
});

// Get the agent instance
const agent = mastra.getAgent("ragAgent");

const prompt = `How to integrate MCP with Mastra?`;

async function fetchAndProcessContent() {
    try {
        const response = await fetch('https://mastra.ai/llms-full.txt');
        const content = await response.text();
        console.log(content.slice(0, 1000));
        
        // Create document and chunk it
        const doc = MDocument.fromText(content);
        const chunks = await doc.chunk({
            strategy: "character",
            size: 4096,
            overlap: 50,
            separator: "\n",
        });
        
        console.log("Number of chunks:", chunks.length);
        
        // Generate embeddings for all chunks
        const { embeddings } = await embedMany({
            model: openai.embedding("text-embedding-3-small"),
            values: chunks.map((chunk) => chunk.text),
        });
        
        // Get the vector store instance from Mastra
        const vectorStore = mastra.getVector("pgVector");
        
        // Create an index for our chunks
        await vectorStore.createIndex({
            indexName: "embeddings",
            dimension: 1536,
        });
        
        // Store chunks with their embeddings
        await vectorStore.upsert({
            indexName: "embeddings",
            vectors: embeddings,
            metadata: chunks.map((chunk) => ({
                text: chunk.text,
                source: "mastra.ai/llms-full.txt",
                timestamp: new Date().toISOString()
            })),
        });
        
        console.log(`Successfully inserted ${chunks.length} chunks into pgVector`);
    } catch (error) {
        console.error('Error fetching or processing content:', error);
    }
}

async function main() {
    // await fetchAndProcessContent();
    
    const completion = await agent.generate(prompt, {
        temperature: 0.1,
    });
    console.log(completion.text);
}

main();