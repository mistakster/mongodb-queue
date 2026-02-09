/**
 *
 * mongodb-queue.js - Use your existing MongoDB as a local queue.
 *
 * Copyright (c) 2014 Andrew Chilton
 * - http://chilts.org/
 * - andychilton@gmail.com
 *
 * License: http://chilts.mit-license.org/2014/
 *
 **/

import { randomBytes } from 'node:crypto';
import type { Collection, Db } from 'mongodb';

// some helper functions
function id() {
  return randomBytes(16)
    .toString('hex');
}

function now() {
  return (new Date()).toISOString();
}

function nowPlusSecs(deltaInSeconds: number) {
  return (new Date(Date.now() + deltaInSeconds * 1000)).toISOString();
}

interface QueueOptions {
  visibility?: number;
  delay?: number;
}

interface QueueAddOptions {
  delay?: number;
}

interface QueueGetOptions {
  visibility?: number;
  maxTimeMS?: number;
}

interface QueuePingOptions {
  visibility?: number;
}

interface QueueDocument<P> {
  visible: string;
  payload: P;
  ack?: string;
  tries?: number;
  deleted?: null | string;
}

export class Queue<Payload> {
  private readonly db: Db;

  private readonly name: string;

  private readonly col: Collection<QueueDocument<Payload>>;

  private readonly visibility: number;

  private readonly delay: number;

  constructor(db: Db, name: string, opts?: QueueOptions) {
    if (!db) {
      throw new Error('mongodb-queue: provide a mongodb.MongoClient.db');
    }
    if (!name) {
      throw new Error('mongodb-queue: provide a queue name');
    }
    opts = opts || {};

    this.db = db;
    this.name = name;
    this.col = db.collection(name);
    this.visibility = opts.visibility ?? 30;
    this.delay = opts.delay ?? 0;
  }

  /**
   * Create required indexes
   */
  async createIndexes() {
    await this.col.createIndex({ deleted: 1, visible: 1 });
    await this.col.createIndex({ ack: 1 }, { unique: true, sparse: true });
  }

  /**
   * Add a new message in the queue
   */
  async add(payload: Payload, opts?: QueueAddOptions) {
    const delay = opts?.delay ?? this.delay;
    const visible = delay ? nowPlusSecs(delay) : now();

    const result = await this.col.insertOne({
      visible,
      payload
    });

    return result.insertedId.toString();
  }

  /**
   * Get the oldest available message from the queue
   */
  async get(opts?: QueueGetOptions) {
    const visibility = opts?.visibility ?? this.visibility;
    const Queue = {
      deleted: null,
      visible: { $lte: now() }
    } as const;
    const update = {
      $inc: { tries: 1 },
      $set: {
        ack: id(),
        visible: nowPlusSecs(visibility)
      }
    } as const;

    const result = await this.col.findOneAndUpdate(
      Queue,
      update,
      {
        // find the oldest item with fewer tries
        sort: {
          tries: 1,
          _id: 1
        },
        returnDocument: 'after',
        maxTimeMS: opts?.maxTimeMS
      }
    );

    if (!result) {
      return null;
    }

    // convert to an external representation
    const { _id, payload, ack, tries } = result;

    return {
      id: _id.toString(),
      ack,
      payload,
      tries
    } as const;
  }

  /**
   * Keep the long-running task active
   */
  async ping(ack: string, opts?: QueuePingOptions) {
    const visibility = opts?.visibility ?? this.visibility;
    const Queue = {
      ack: ack,
      visible: { $gt: now() },
      deleted: null
    };
    const update = {
      $set: {
        visible: nowPlusSecs(visibility)
      }
    };

    const msg = await this.col.findOneAndUpdate(
      Queue,
      update,
      { returnDocument: 'after' }
    );

    if (!msg) {
      throw new Error('Queue.ping(): Unidentified ack  : ' + ack);
    }

    return msg._id.toString();
  }

  /**
   * Complete the task
   */
  async ack(ack: string) {
    const Queue = {
      ack: ack,
      visible: { $gt: now() },
      deleted: null
    };
    const update = {
      $set: {
        deleted: now()
      }
    };

    const msg = await this.col.findOneAndUpdate(
      Queue,
      update,
      { returnDocument: 'after' }
    );

    if (!msg) {
      throw new Error('Queue.ack(): Unidentified ack : ' + ack);
    }

    return msg._id.toString();
  }

  async clean() {
    const Queue = {
      deleted: { $exists: true }
    };

    await this.col.deleteMany(Queue);
  }

  async total() {
    return this.col.countDocuments();
  }

  async size() {
    const Queue = {
      deleted: null,
      visible: { $lte: now() }
    };

    return this.col.countDocuments(Queue);
  }

  async inFlight() {
    const Queue = {
      ack: { $exists: true },
      visible: { $gt: now() },
      deleted: null
    };

    return this.col.countDocuments(Queue);
  }

  async done() {
    const Queue = {
      deleted: { $exists: true }
    };

    return this.col.countDocuments(Queue);
  }
}
