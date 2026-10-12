local existingJobId = redis.call(
  "GET",
  KEYS[1]
)

if existingJobId then
  return { existingJobId, 0 }
end

redis.call(
  "SET",
  KEYS[1],
  ARGV[1],
  "EX",
  ARGV[2]
)

redis.call(
  "HSET",
  KEYS[2],
  "status", "QUEUED",
  "progress", "0",
  "records", "0",
  "retryCount", "0",
  "streamStatus", "PENDING",
  "createdAt", ARGV[3],
  "updatedAt", ARGV[3]
)

return { ARGV[1], 1 }