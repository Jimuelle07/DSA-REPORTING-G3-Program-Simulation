/* The C program shown in the code panel. Single source of truth: QUEUE.md §7.5.
   scripts/check-c.mjs compiles this exact text. Do not edit it without re-running that check. */
globalThis.C_SOURCE = String.raw`/* drive_thru.c - Drive-thru lane as an array-based queue (FIFO): straight and ring */
#include <stdio.h>
#include <stdbool.h>

#define MAX_ORDER 32   /* order text, e.g. "FRIES + SODA"      */
#define MAX_CAP    6   /* largest LANE SIZE option             */

/* ---------- 1. The data ---------- */
typedef struct {
    int  ticket;             /* car number painted on the roof   */
    char order[MAX_ORDER];   /* what the driver ordered          */
} Car;

typedef struct {
    Car items[MAX_CAP];
    int front;               /* index of the first car (pickup)  */
    int rear;                /* index of the last car (entry)    */
    int count;               /* cars in the lane                 */
    int capacity;            /* chosen LANE SIZE: 3, 4, 5, 6     */
} Queue;

/* ---------- 2. Queue operations shared by both lanes ---------- */
void init(Queue *q, int capacity) {
    q->front = 0;
    q->rear = -1;
    q->count = 0;
    q->capacity = capacity;
}

bool isEmpty(const Queue *q) { return q->count == 0; }
bool isFull(const Queue *q)  { return q->count == q->capacity; }
int  size(const Queue *q)    { return q->count; }
void clear(Queue *q)         { q->front = 0; q->rear = -1; q->count = 0; }

const Car *peek(const Queue *q) {
    if (isEmpty(q)) {
        return NULL;
    }
    return &q->items[q->front];       /* look at the front, don't remove */
}
/* No getAt(i): a queue only touches its FRONT and its REAR. */

/* ---------- 3. Straight lane: linear queue, cars roll forward ---------- */
bool enqueueLine(Queue *q, Car c) {
    if (isFull(q)) {
        return false;                 /* QUEUE OVERFLOW: lane full    */
    }
    q->rear++;
    q->items[q->rear] = c;
    q->count++;
    return true;
}

bool dequeueLine(Queue *q, Car *out) {
    int i;
    if (isEmpty(q)) {
        return false;                 /* QUEUE UNDERFLOW: lane empty  */
    }
    *out = q->items[q->front];        /* front is always slot 0       */
    for (i = 0; i < q->count - 1; i++) {
        q->items[i] = q->items[i + 1];    /* every car rolls forward: O(n) */
    }
    q->rear--;
    q->count--;
    return true;
}

/* ---------- 4. Ring lane: circular queue, pointers wrap ---------- */
bool enqueueRing(Queue *q, Car c) {
    if (isFull(q)) {
        return false;                 /* QUEUE OVERFLOW: lane full    */
    }
    q->rear = (q->rear + 1) % q->capacity;    /* wraps to reuse slot 0 */
    q->items[q->rear] = c;
    q->count++;
    return true;
}

bool dequeueRing(Queue *q, Car *out) {
    if (isEmpty(q)) {
        return false;                 /* QUEUE UNDERFLOW: lane empty  */
    }
    *out = q->items[q->front];
    q->front = (q->front + 1) % q->capacity;  /* no shifting: O(1)     */
    q->count--;
    return true;
}

/* ---------- 5. The drive-thru ---------- */
Queue lane;
bool ringMode = false;       /* LANE toggle: false = STRAIGHT, true = RING */
int nextTicket = 1;
int turnedAway = 0;

bool arrive(const char *order) {
    Car c;
    bool ok;
    c.ticket = nextTicket++;
    snprintf(c.order, MAX_ORDER, "%s", order);
    if (ringMode) {
        ok = enqueueRing(&lane, c);
    } else {
        ok = enqueueLine(&lane, c);
    }
    if (!ok) {
        turnedAway++;                 /* lane full: the car drives off */
    }
    return ok;
}

bool serve(Car *out) {
    if (ringMode) {
        return dequeueRing(&lane, out);
    }
    return dequeueLine(&lane, out);
}

/* ---------- 6. Demo: the classroom script ---------- */
void show(const char *step) {
    int i;
    printf("%s\n  lane  [", step);
    for (i = 0; i < lane.count; i++) {
        const Car *c = &lane.items[(lane.front + i) % lane.capacity];
        printf("%s#%d %s", i ? ", " : "", c->ticket, c->order);
    }
    printf("]  front %d  rear %d  size %d/%d\n",
           lane.front, lane.rear, size(&lane), lane.capacity);
}

int main(void) {
    Car out;
    const Car *first;
    bool ok;

    init(&lane, 5);              show("1  open (STRAIGHT lane, 5 spots)");
    arrive("BURGER");            show("2  arrive #1");
    arrive("FRIES + SODA");      show("3  arrive #2");
    arrive("NUGGETS");           show("4  arrive #3");
    first = peek(&lane);
    if (first) {
        printf("5  peek -> #%d %s (size still %d)\n", first->ticket, first->order, size(&lane));
    }
    serve(&out);                 show("6  serve #1 (cars roll forward)");
    arrive("SUNDAE");
    arrive("BURGER + SODA");
    arrive("FRIES");             show("7  arrive #4 #5 #6 (lane full)");
    ok = arrive("NUGGETS");
    printf("8  arrive #7 returns %s (OVERFLOW, turned away %d)\n", ok ? "true" : "false", turnedAway);
    printf("9  serve #4 from the middle: not allowed (no getAt in a queue)\n");
    while (serve(&out)) {
        printf("10 serve -> #%d %s\n", out.ticket, out.order);
    }
    show("10 next serve returns false (UNDERFLOW)");

    ringMode = true;
    init(&lane, 5);              show("11 LANE = RING (reset)");
    arrive("BURGER");
    arrive("FRIES");
    arrive("SODA");              show("12 arrive #8 #9 #10");
    serve(&out);
    serve(&out);                 show("13 serve #8 #9 (front moves, no shifting)");
    arrive("NUGGETS");
    arrive("SUNDAE");
    arrive("BURGER + FRIES");    show("14 arrive #11 #12 #13 (rear wraps to 0)");
    arrive("SODA");              show("15 arrive #14 (lane full)");
    serve(&out);
    serve(&out);
    serve(&out);                 show("16 serve #10 #11 #12 (front wraps to 0)");
    return 0;
}
`;
