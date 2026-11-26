export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Thêm dao động ngẫu nhiên ±20% để request không đều tăm tắp như bot. */
export const jitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4));
