/* The C program shown in the code panel. Single source of truth: STACK.md §7.6.
   scripts/check-c.mjs compiles this exact text. Do not edit it without re-running that check. */
globalThis.C_SOURCE = String.raw`/* undo_redo.c - Undo/Redo text editor using two array-based stacks (LIFO) */
#include <stdio.h>
#include <stdbool.h>
#include <ctype.h>
#include <string.h>

#define MAX_TEXT  256   /* document buffer size (255 chars + '\0')  */
#define MAX_LABEL  32   /* block label, e.g. +"World"                */
#define MAX_CAP     6   /* largest MAX HISTORY option                */

/* ---------- 1. The data ---------- */
typedef struct {
    char label[MAX_LABEL];   /* what the user did             */
    char before[MAX_TEXT];   /* document before the action    */
    char after[MAX_TEXT];    /* document after the action     */
} Action;

typedef struct {
    Action items[MAX_CAP];
    int top;                 /* index of the top item; -1 = empty */
    int capacity;            /* chosen MAX HISTORY: 3, 4, 5, 6    */
} Stack;

/* ---------- 2. Stack operations (all O(1)) ---------- */
void init(Stack *s, int capacity) {
    s->top = -1;
    s->capacity = capacity;
}

bool isEmpty(const Stack *s) { return s->top == -1; }
bool isFull(const Stack *s)  { return s->top == s->capacity - 1; }
int  size(const Stack *s)    { return s->top + 1; }
void clear(Stack *s)         { s->top = -1; }

bool push(Stack *s, Action a) {
    if (isFull(s)) {
        return false;                 /* STACK OVERFLOW  */
    }
    s->top++;
    s->items[s->top] = a;
    return true;
}

bool pop(Stack *s, Action *out) {
    if (isEmpty(s)) {
        return false;                 /* STACK UNDERFLOW */
    }
    *out = s->items[s->top];
    s->top--;
    return true;
}

const Action *peek(const Stack *s) {
    if (isEmpty(s)) {
        return NULL;
    }
    return &s->items[s->top];         /* look, don't remove */
}

/* ---------- 3. The editor: two stacks ---------- */
Stack undoStack, redoStack;
char doc[MAX_TEXT] = "";

/* Drop the oldest (bottom) action using only push/pop: O(n) */
void evictOldest(Stack *s) {
    Stack temp;
    Action a;
    init(&temp, s->capacity);
    while (pop(s, &a)) {
        push(&temp, a);               /* reverse: oldest ends on top */
    }
    pop(&temp, &a);                   /* discard the oldest          */
    while (pop(&temp, &a)) {
        push(s, a);                   /* restore the original order  */
    }
}

void doAction(Action a) {
    if (!isEmpty(&redoStack)) {
        clear(&redoStack);            /* INVALIDATION: new branch    */
    }
    if (!push(&undoStack, a)) {       /* OVERFLOW: stack is full     */
        evictOldest(&undoStack);
        push(&undoStack, a);
    }
    strcpy(doc, a.after);
}

bool undo(void) {
    Action a;
    if (!pop(&undoStack, &a)) {
        return false;                 /* nothing to undo */
    }
    strcpy(doc, a.before);
    push(&redoStack, a);              /* same block moves across */
    return true;
}

bool redo(void) {
    Action a;
    if (!pop(&redoStack, &a)) {
        return false;                 /* nothing to redo */
    }
    strcpy(doc, a.after);
    push(&undoStack, a);
    return true;
}

/* ---------- 4. Helpers for the TYPE / DELETE buttons ---------- */
Action makeAction(char sign, const char *word, const char *after) {
    Action a;
    snprintf(a.label, MAX_LABEL, "%c\"%.27s\"", sign, word);
    strcpy(a.before, doc);
    strcpy(a.after, after);
    return a;
}

bool typeWord(const char *word) {
    char after[MAX_TEXT];
    size_t need = strlen(doc) + (doc[0] ? 1 : 0) + strlen(word);
    if (need >= MAX_TEXT) {
        return false;                 /* document full (255 chars) */
    }
    strcpy(after, doc);
    if (doc[0] != '\0') {
        strcat(after, " ");
    }
    strcat(after, word);
    doAction(makeAction('+', word, after));
    return true;
}

bool deleteLastWord(void) {
    char word[MAX_TEXT], after[MAX_TEXT];
    size_t end = strlen(doc), start, keep;
    while (end > 0 && isspace((unsigned char)doc[end - 1])) {
        end--;                        /* skip trailing spaces         */
    }
    if (end == 0) {
        return false;                 /* nothing to delete            */
    }
    start = end;
    while (start > 0 && !isspace((unsigned char)doc[start - 1])) {
        start--;                      /* walk back to the word start  */
    }
    keep = start;
    while (keep > 0 && isspace((unsigned char)doc[keep - 1])) {
        keep--;                       /* drop the space before it     */
    }
    memcpy(word, doc + start, end - start);
    word[end - start] = '\0';
    memcpy(after, doc, keep);
    after[keep] = '\0';
    doAction(makeAction('-', word, after));
    return true;
}

/* ---------- 5. Demo: the classroom script ---------- */
void printStack(const char *name, const Stack *s) {
    int i;
    printf("  %-5s [", name);
    for (i = 0; i <= s->top; i++) {
        printf("%s%s", i ? ", " : "", s->items[i].label);
    }
    printf("]  size %d/%d\n", size(s), s->capacity);
}

void show(const char *step) {
    printf("%s\n  doc   \"%s\"\n", step, doc);
    printStack("undo", &undoStack);
    printStack("redo", &redoStack);
}

int main(void) {
    const Action *top;
    init(&undoStack, 6);
    init(&redoStack, 6);

    show("1  open");
    typeWord("Hello");   show("2  type Hello");
    typeWord("World");   show("3  type World");
    top = peek(&undoStack);
    printf("4  peek -> %s (size still %d)\n", top ? top->label : "NULL", size(&undoStack));
    undo();              show("5  undo");
    redo();              show("6  redo");
    deleteLastWord();    show("7  delete");
    undo();              show("8  undo");
    undo();              show("9  undo");
    typeWord("There");   show("10 type There (redo cleared)");
    undo(); undo();
    printf("11 third undo returns %s (UNDERFLOW)\n", undo() ? "true" : "false");
    show("11 after undo x3");

    init(&undoStack, 3);
    init(&redoStack, 3);  show("12 max history = 3");
    typeWord("a"); typeWord("b"); typeWord("c"); typeWord("d");
    show("13 type a b c d (OVERFLOW evicts +a)");
    undo(); undo(); undo();
    printf("14 fourth undo returns %s\n", undo() ? "true" : "false");
    show("14 after undo x3");
    return 0;
}
`;
