# Asterisk Worker

## Overview

The **Asterisk Worker** is a TypeScript-based service designed to handle Asterisk-related tasks efficiently. The project leverages Node.js with Nestjs, RabbitMQ and SQLite

## Installation & Setup

### Prerequisites

- **Node.js** (>= 18.x recommended)
- **pnpm** (package manager)

### Steps

1. **Clone the Repository**

   ```sh
   git clone <repository-url>
   cd asterisk-worker
   ```

2. **Install Dependencies**

   ```sh
   pnpm install
   ```

3. **Setup Environment Variables**
   - Copy `.env.example` to `.env` and configure necessary values.
   ```sh
   cp .env.example .env
   ```

## Implementation Details

### Project Structure

```
asterisk-worker/
├── src/
│   ├── app/
│   │   ├── app.controller.ts       # API controller
│   │   ├── app.controller.spec.ts  # Controller test
│   │   ├── app.module.ts           # Main application module
│   │   ├── app.service.ts          # Service logic
│   │   ├── app.service.spec.ts     # Service test
│   ├── assets/
│   │   ├── .gitkeep                # Placeholder for assets
│   ├── definitions/
│   │   ├── hangup-cause.ts         # Definitions for hangup causes
│   ├── entities/
│   │   ├── ivr.entity.ts           # IVR entity model
│   │   ├── session.entity.ts       # Session entity model
│   ├── utils/
│   │   ├── call-utils.ts           # Utility functions for calls
│   │   ├── error-message.ts        # Error handling utilities
│   │   ├── index.ts                # Utility index
│   ├── workers/
│   │   ├── ami.service.ts          # Asterisk Manager Interface for reporting service
│   │   ├── asterisk.module.ts      # Asterisk module
│   │   ├── asterisk.worker.ts      # Worker handling Asterisk events
│   │   ├── audio.service.ts        # Audio processing service
│   │   ├── ivr.service.ts          # IVR handling service
│   ├── main.ts                     # Application entry point
├── .env                             # Environment configuration
```

### Key Functionalities

- **Asterisk Communication**: Interacts with Asterisk PBX to manage calls and events.

## Running the Project

### Development Mode

```sh
pnpm run start:asterisk-worker
```

## Project Concept

# Asterisk Worker for handling API calls

#### Responsibilities:

- Listens to `TRANSPORT_VOICE` queue to process transport requests.
- Fetches session and IVR data using sessionCache and ivrCache.
- Calls IVRService for IVR workflows and AudioService for audio processing.
- Logs results and manages retries in case of failures.

#### Key Methods:

- makeTransportReady(sessionCuid): Prepares transport (IVR/audio) for a session.
- sendBroadcast(data): Processes voice-based broadcasts.

#### Working Mechanism

- Once the API call is made using the `/broadcasts`
- Fetches the session from dataProvider.
- Checks if the session exists in the sessionCache:
- If not, creates an entry with hasAudio: true.
- If the session type is 'new-ivr':
- Checks if IVR data exists in ivrCache.
- If missing, prepares JSON data using audioService.makeJSONReady() and caches it in SQLite.
- Waits 5 seconds before proceeding.
- If not IVR, it prepares audio using audioService.makeAudioReady().
- Waits 15 seconds before returning true to handle asterisk readiness for new audios.
- Errors are logged via this.logger.error(e.message).

<hr/>

# IVRService for making Nested IVR Calls and recording user interaction through DTMF

#### Overview

The IVRService class in NestJS integrates with an Asterisk ARI (Asterisk REST Interface) to manage Interactive Voice Response (IVR) calls, handle DTMF inputs, and control call flows.

#### Key Functionalities

##### Module Lifecycle Hooks

- `onModuleInit()`: Initializes ARI connection and registers event listeners.
- `onModuleDestroy()`: Stops the ARI client when the module is destroyed.

##### Call Management

- `callEndpoint()`: Formats phone numbers for outbound calls.
- `sendBroadcast()`: Initiates an IVR call to a target number.
- `originateCall()`: Creates and dials a new call using ARI.

##### Audio & IVR Interaction

- `playAudio()`: Plays an audio file to the caller.
- `playPrompt()`: Plays specific IVR prompts based on user input.
- `stopActivePlayback()`: Stops ongoing audio playback.

##### Call Hangup & Cleanup

- `scheduleHangup()`: Schedules a call hangup after a timeout.
- `cancelScheduledHangup()`: Cancels a scheduled hangup.
- `cleanupChannel()`: Cleans up resources after call completion.

##### DTMF Handling

- `handleDTMF()`: Processes user keypresses and directs IVR flow accordingly.

#### Core Dependencies

- `@rsconnect/queue`: Manages background tasks like batch monitoring.
- `@rumsan/connect/types`: Provides types for broadcasting and queue logs.
- `ari-client`: Connects to the Asterisk ARI for managing VoIP calls.

This service enables automated IVR call handling, allowing dynamic prompts and actions based on user input.

The responses, DTMF key press, every actions that occurs in the IVR services are then recorded into the database through the use of `AMI services`

<hr/>

# AMIService - Asterisk Manager Interface (AMI) Integration for Reporting Call Events

## AMI Service - Short Explanation

### 1. **Asterisk Manager Interface (AMI)**

- AMI is a management API for Asterisk PBX systems.
- Allows real-time monitoring and control of calls.
- Uses TCP for communication.

### 2. **AMI Events & Call Lifecycle**

- `DialState`: When a call starts dialing.
- `DialEnd`: When a call is answered or fails.
- `Hangup`: When a call ends, providing call disposition.
- `Cdr` (Call Detail Record): Stores call metadata like duration and timestamps.
- `DTMFEnd`: Captures IVR key presses.

### 3. **AMI Connection & Authentication**

- Requires a host, port, username, and password.
- Uses `keepConnected()` to maintain session persistence.

### 4. **Call Logging & Status Updates**

- `BatchManager`: Manages call logs for tracking.
- `BroadcastLogQueue`: Queues call details for further processing.

### 5. **Event-Driven Architecture**

- Listens to AMI events and triggers actions accordingly.
- Updates call statuses in real time.

### 6. **Integration with RabbitMQ**

- Uses `ChannelWrapper` to send processed call logs.
- Ensures asynchronous message handling.

### 7. **Error Handling & Resilience**

- Auto-reconnect mechanism for connection failures.
- Logs errors and unexpected behaviors for debugging.
