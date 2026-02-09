# @mistakster/mongodb-queue

Use your existing MongoDB as a local queue. This is a TypeScript ESM module compatible with Node.js 16+ and Bun.

## Installation

```bash
npm install @mistakster/mongodb-queue mongodb
# or
bun add @mistakster/mongodb-queue mongodb
```

## Usage

```typescript
import { MongoClient } from 'mongodb';
import { Queue } from '@mistakster/mongodb-queue';

// Connect to MongoDB
const client = new MongoClient('mongodb://localhost:27017');
await client.connect();
const db = client.db('myapp');

// Create a queue
const queue = new Queue(db, 'my-queue', {
  visibility: 30,  // Message visibility timeout in seconds (default: 30)
  delay: 0         // Delay before message becomes visible in seconds (default: 0)
});

// Create indexes (run once)
await queue.createIndexes();

// Add a message to the queue
const messageId = await queue.add({
  task: 'process-image',
  imageId: '12345'
});

// Get a message from the queue
const msg = await queue.get();
if (msg) {
  console.log(msg.payload); // { task: 'process-image', imageId: '12345' }

  // Keep the message alive if processing takes longer
  await queue.ping(msg.ack);

  // Complete the task
  await queue.ack(msg.ack);
}

// Queue statistics
const total = await queue.total();       // Total messages
const size = await queue.size();         // Available messages
const inFlight = await queue.inFlight(); // Messages being processed
const done = await queue.done();         // Completed messages

// Clean up completed messages
await queue.clean();
```

## API

### `new Queue<P>(db, name, options?)`

Creates a new queue instance.

- `db`: MongoDB database instance
- `name`: Queue collection name
- `options.visibility`: Message visibility timeout in seconds (default: 30)
- `options.delay`: Default delay before messages become visible (default: 0)

### `queue.createIndexes()`

Creates required indexes on the queue collection. Should be run once during setup.

### `queue.add(payload, options?)`

Adds a message to the queue.

- `payload`: Message payload (any type)
- `options.delay`: Override default delay for this message
- Returns: Message ID

### `queue.get(options?)`

Gets the oldest available message from the queue.

- `options.visibility`: Override default visibility timeout
- `options.maxTimeMS`: Maximum time to wait for a message
- Returns: Message object or null if queue is empty

### `queue.ping(ack, options?)`

Extends the visibility timeout of a message being processed.

- `ack`: Acknowledgment ID from the message
- `options.visibility`: Override default visibility timeout
- Returns: Message ID

### `queue.ack(ack)`

Marks a message as completed and removes it from the queue.

- `ack`: Acknowledgment ID from the message
- Returns: Message ID

### `queue.clean()`

Removes all completed messages from the queue.

### `queue.total()`

Returns the total number of messages in the queue (including deleted).

### `queue.size()`

Returns the number of available messages in the queue.

### `queue.inFlight()`

Returns the number of messages currently being processed.

### `queue.done()`

Returns the number of completed messages.

## Development

### Building

The module is written in TypeScript and compiled to JavaScript for distribution:

```bash
# Install dependencies
bun install

# Build the module (generates dist/ folder)
bun run build

# Clean build artifacts
bun run clean
```

### Project Structure

```
@mistakster/mongodb-queue/
├── index.ts          # Entry point (exports Queue)
├── src/
│   └── Queue.ts      # Queue implementation
├── dist/             # Compiled JavaScript (generated)
│   ├── index.js
│   ├── index.d.ts
│   └── src/
│       ├── Queue.js
│       └── Queue.d.ts
└── package.json
```

## Compatibility

- **Node.js**: 16.20.0 or higher
- **Bun**: All versions
- **MongoDB**: 4.0.0 to 7.x

## License

MIT License - Copyright (c) 2014 Andrew Chilton
