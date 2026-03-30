# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
Express webhook server bridging Privos chat to TVibe AI. Privos sends webhook on new messages, server calls TVibe, replies via bot token.

## Commands
- `npm start` — Run bot
- `npm run dev` — Run with auto-reload
- `npm install` — Install dependencies

## Architecture
Single-file Express server (bot.js). Receives POST /webhook from Privos, forwards message to TVibe sync API, sends response back via Privos bot API.

## Key Environment Variables
See .env.example for all required config. Copy to .env before running.
