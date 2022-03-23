import TaskQueue from "./taskqueue.ts";

const timer = (tag: string, sec: number = Math.random() * 1000 | 0) =>
  async () => {
    console.log(tag, "start");
    await new Promise<void>((resolve) => setTimeout(resolve, sec));
    console.log(tag, "end");
  };

const timer_throw = (tag: string, sec: number = Math.random() * 1000 | 0) =>
  async () => {
    console.log(tag, "start");
    await new Promise<void>((resolve) => setTimeout(resolve, sec));
    throw new Error(tag);
  };

Deno.test(async function basic() {
  const queue = new TaskQueue(5);
  for (let i = 0; i < 10; i++) {
    queue.enqueue(timer("task-" + i));
  }
  await queue.wait;
});

Deno.test(async function exception() {
  const queue = new TaskQueue(5);
  for (let i = 0; i < 10; i++) {
    queue.enqueue(timer_throw("task-" + i));
  }
  const notthrow = Symbol();
  try {
    await queue.wait;
    throw notthrow;
  } catch (e) {
    if (e == notthrow) {
      throw new Error("expect throw");
    }
  }
});
