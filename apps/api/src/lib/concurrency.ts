import type IORedis from "ioredis"

const SLOT_KEY_PREFIX = "techteam:dev-slots:"
const SLOT_TTL = 3600 // 1 hour safety TTL

/**
 * Atomically acquire a development slot for a demand within a project.
 * Uses a Lua script to ensure atomic check-and-acquire with Redis sets.
 * Returns true if the slot was acquired, false if at capacity.
 */
export async function acquireDevSlot(
  redis: IORedis,
  projectId: string,
  demandId: string,
  maxConcurrent: number
): Promise<boolean> {
  const key = `${SLOT_KEY_PREFIX}${projectId}`

  // Lua script for atomic check-and-acquire
  const script = `
    local current = redis.call('SCARD', KEYS[1])
    if current < tonumber(ARGV[1]) then
      redis.call('SADD', KEYS[1], ARGV[2])
      redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
      return 1
    end
    return 0
  `

  const result = await redis.eval(
    script,
    1,
    key,
    maxConcurrent,
    demandId,
    SLOT_TTL
  )
  return result === 1
}

/**
 * Release a development slot for a demand within a project.
 */
export async function releaseDevSlot(
  redis: IORedis,
  projectId: string,
  demandId: string
): Promise<void> {
  const key = `${SLOT_KEY_PREFIX}${projectId}`
  await redis.srem(key, demandId)
}

/**
 * Get the number of active development slots for a project.
 */
export async function getActiveDevCount(
  redis: IORedis,
  projectId: string
): Promise<number> {
  const key = `${SLOT_KEY_PREFIX}${projectId}`
  return redis.scard(key)
}
