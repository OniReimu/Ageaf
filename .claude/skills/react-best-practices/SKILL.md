---
name: react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, refactoring, or optimizing React/Next.js code. Activates on explicit /react-best-practices or intent like "optimize React component", "improve Next.js performance", "review React code", "refactor component", "reduce bundle size", or when working with .jsx, .tsx files in React/Next.js projects.
version: 1.0.0
author: Vercel Engineering
license: MIT
source: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
---

# React Best Practices

**Version 1.0.0**
Vercel Engineering
January 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring React and Next.js codebases. Humans
> may also find it useful, but guidance here is optimized for automation
> and consistency by AI-assisted workflows.

---

## Abstract

Comprehensive performance optimization guide for React and Next.js applications, designed for AI agents and LLMs. Contains 40+ rules across 8 categories, prioritized by impact from critical (eliminating waterfalls, reducing bundle size) to incremental (advanced patterns). Each rule includes detailed explanations, real-world examples comparing incorrect vs. correct implementations, and specific impact metrics to guide automated refactoring and code generation.

---

## When to Use This Skill

Apply these guidelines when:
- **Writing** new React components or Next.js pages/layouts
- **Reviewing** code for performance issues or anti-patterns
- **Refactoring** existing React/Next.js code
- **Optimizing** bundle size, load times, or runtime performance
- **Implementing** data fetching (client or server-side)
- **Debugging** performance bottlenecks or render issues

---

## Quick Reference: Priority Matrix

| Priority | Category | Impact | Key Focus |
|----------|----------|--------|-----------|
| 🔴 **CRITICAL** | Eliminating Waterfalls | Massive | Sequential awaits, parallel fetching |
| 🔴 **CRITICAL** | Bundle Size | Massive | Barrel imports, dynamic imports |
| 🟠 **HIGH** | Server-Side Performance | High | React.cache(), RSC composition |
| 🟡 **MEDIUM-HIGH** | Client-Side Data | Medium-High | SWR, event listeners |
| 🟡 **MEDIUM** | Re-render Optimization | Medium | useMemo, useCallback, functional setState |
| 🟡 **MEDIUM** | Rendering Performance | Medium | JSX hoisting, content-visibility |
| 🔵 **LOW-MEDIUM** | JavaScript Performance | Low-Medium | Loop optimization, caching |
| ⚪ **LOW** | Advanced Patterns | Low | Specialized techniques |

---

## Table of Contents

1. [Eliminating Waterfalls](#1-eliminating-waterfalls) — **CRITICAL**
   - 1.1 [Defer Await Until Needed](#11-defer-await-until-needed)
   - 1.2 [Dependency-Based Parallelization](#12-dependency-based-parallelization)
   - 1.3 [Prevent Waterfall Chains in API Routes](#13-prevent-waterfall-chains-in-api-routes)
   - 1.4 [Promise.all() for Independent Operations](#14-promiseall-for-independent-operations)
   - 1.5 [Strategic Suspense Boundaries](#15-strategic-suspense-boundaries)
2. [Bundle Size Optimization](#2-bundle-size-optimization) — **CRITICAL**
   - 2.1 [Avoid Barrel File Imports](#21-avoid-barrel-file-imports)
   - 2.2 [Conditional Module Loading](#22-conditional-module-loading)
   - 2.3 [Defer Non-Critical Third-Party Libraries](#23-defer-non-critical-third-party-libraries)
   - 2.4 [Dynamic Imports for Heavy Components](#24-dynamic-imports-for-heavy-components)
   - 2.5 [Preload Based on User Intent](#25-preload-based-on-user-intent)
3. [Server-Side Performance](#3-server-side-performance) — **HIGH**
   - 3.1 [Authenticate Server Actions Like API Routes](#31-authenticate-server-actions-like-api-routes)
   - 3.2 [Avoid Duplicate Serialization in RSC Props](#32-avoid-duplicate-serialization-in-rsc-props)
   - 3.3 [Cross-Request LRU Caching](#33-cross-request-lru-caching)
   - 3.4 [Minimize Serialization at RSC Boundaries](#34-minimize-serialization-at-rsc-boundaries)
   - 3.5 [Parallel Data Fetching with Component Composition](#35-parallel-data-fetching-with-component-composition)
   - 3.6 [Per-Request Deduplication with React.cache()](#36-per-request-deduplication-with-reactcache)
   - 3.7 [Use after() for Non-Blocking Operations](#37-use-after-for-non-blocking-operations)
4. [Client-Side Data Fetching](#4-client-side-data-fetching) — **MEDIUM-HIGH**
   - 4.1 [Deduplicate Global Event Listeners](#41-deduplicate-global-event-listeners)
   - 4.2 [Use Passive Event Listeners for Scrolling Performance](#42-use-passive-event-listeners-for-scrolling-performance)
   - 4.3 [Use SWR for Automatic Deduplication](#43-use-swr-for-automatic-deduplication)
   - 4.4 [Version and Minimize localStorage Data](#44-version-and-minimize-localstorage-data)
5. [Re-render Optimization](#5-re-render-optimization) — **MEDIUM**
   - 5.1 [Calculate Derived State During Rendering](#51-calculate-derived-state-during-rendering)
   - 5.2 [Defer State Reads to Usage Point](#52-defer-state-reads-to-usage-point)
   - 5.3 [Do not wrap a simple expression with a primitive result type in useMemo](#53-do-not-wrap-a-simple-expression-with-a-primitive-result-type-in-usememo)
   - 5.4 [Extract Default Non-primitive Parameter Value from Memoized Component to Constant](#54-extract-default-non-primitive-parameter-value-from-memoized-component-to-constant)
   - 5.5 [Extract to Memoized Components](#55-extract-to-memoized-components)
   - 5.6 [Narrow Effect Dependencies](#56-narrow-effect-dependencies)
   - 5.7 [Put Interaction Logic in Event Handlers](#57-put-interaction-logic-in-event-handlers)
   - 5.8 [Subscribe to Derived State](#58-subscribe-to-derived-state)
   - 5.9 [Use Functional setState Updates](#59-use-functional-setstate-updates)
   - 5.10 [Use Lazy State Initialization](#510-use-lazy-state-initialization)
   - 5.11 [Use Transitions for Non-Urgent Updates](#511-use-transitions-for-non-urgent-updates)
   - 5.12 [Use useRef for Transient Values](#512-use-useref-for-transient-values)
6. [Rendering Performance](#6-rendering-performance) — **MEDIUM**
   - 6.1 [Animate SVG Wrapper Instead of SVG Element](#61-animate-svg-wrapper-instead-of-svg-element)
   - 6.2 [CSS content-visibility for Long Lists](#62-css-content-visibility-for-long-lists)
   - 6.3 [Hoist Static JSX Elements](#63-hoist-static-jsx-elements)
   - 6.4 [Optimize SVG Precision](#64-optimize-svg-precision)
   - 6.5 [Prevent Hydration Mismatch Without Flickering](#65-prevent-hydration-mismatch-without-flickering)
   - 6.6 [Suppress Expected Hydration Mismatches](#66-suppress-expected-hydration-mismatches)
   - 6.7 [Use Activity Component for Show/Hide](#67-use-activity-component-for-showhide)
   - 6.8 [Use Explicit Conditional Rendering](#68-use-explicit-conditional-rendering)
   - 6.9 [Use useTransition Over Manual Loading States](#69-use-usetransition-over-manual-loading-states)
7. [JavaScript Performance](#7-javascript-performance) — **LOW-MEDIUM**
   - 7.1 [Avoid Layout Thrashing](#71-avoid-layout-thrashing)
   - 7.2 [Build Index Maps for Repeated Lookups](#72-build-index-maps-for-repeated-lookups)
   - 7.3 [Cache Property Access in Loops](#73-cache-property-access-in-loops)
   - 7.4 [Cache Repeated Function Calls](#74-cache-repeated-function-calls)
   - 7.5 [Cache Storage API Calls](#75-cache-storage-api-calls)
   - 7.6 [Combine Multiple Array Iterations](#76-combine-multiple-array-iterations)
   - 7.7 [Early Length Check for Array Comparisons](#77-early-length-check-for-array-comparisons)
   - 7.8 [Early Return from Functions](#78-early-return-from-functions)
   - 7.9 [Hoist RegExp Creation](#79-hoist-regexp-creation)
   - 7.10 [Use Loop for Min/Max Instead of Sort](#710-use-loop-for-minmax-instead-of-sort)
   - 7.11 [Use Set/Map for O(1) Lookups](#711-use-setmap-for-o1-lookups)
   - 7.12 [Use toSorted() Instead of sort() for Immutability](#712-use-tosorted-instead-of-sort-for-immutability)
8. [Advanced Patterns](#8-advanced-patterns) — **LOW**
   - 8.1 [Initialize App Once, Not Per Mount](#81-initialize-app-once-not-per-mount)
   - 8.2 [Store Event Handlers in Refs](#82-store-event-handlers-in-refs)
   - 8.3 [useEffectEvent for Stable Callback Refs](#83-useeffectevent-for-stable-callback-refs)

---

## 1. Eliminating Waterfalls

**Impact: CRITICAL**

Waterfalls are the #1 performance killer. Each sequential await adds full network latency. Eliminating them yields the largest gains.

### 1.1 Defer Await Until Needed

**Impact: HIGH (avoids blocking unused code paths)**

Deferring `await` until you actually need the result allows downstream code to run in parallel with the async operation. This is especially valuable in React Server Components, where data fetching waterfalls can add hundreds of milliseconds.

#### ❌ Incorrect

```tsx
async function Page() {
  const user = await fetchUser();
  const posts = await fetchPosts(); // waits for user even though it doesn't need it
  return <div>...</div>;
}
```

#### ✅ Correct

```tsx
async function Page() {
  const userPromise = fetchUser();
  const postsPromise = fetchPosts();

  const user = await userPromise;  // only await when needed
  const posts = await postsPromise;
  return <div>...</div>;
}
```

**Why:** By deferring `await`, both fetches start simultaneously instead of sequentially. This can save 100-500ms per eliminated waterfall.

---

### 1.2 Dependency-Based Parallelization

**Impact: CRITICAL (can halve total load time)**

Use libraries like `better-all` to express dependencies while maximizing parallelism. This is more maintainable than manually orchestrating Promise.all() chains.

#### ❌ Incorrect

```tsx
const user = await fetchUser(userId);
const posts = await fetchPosts(user.id);
const comments = await fetchComments(posts[0].id);
```

**Problem:** Sequential execution creates a waterfall. Total time = T(user) + T(posts) + T(comments).

#### ✅ Correct

```tsx
import { all } from 'better-all';

const { user, posts, comments } = await all({
  user: () => fetchUser(userId),
  posts: ({ user }) => fetchPosts(user.id),
  comments: ({ posts }) => fetchComments(posts[0].id)
});
```

**Why:** `better-all` automatically runs independent tasks in parallel. If `fetchPosts` and other operations can run concurrently, total time approaches `max(T(user), T(posts), T(comments))` instead of sum.

---

### 1.3 Prevent Waterfall Chains in API Routes

**Impact: HIGH (API latency compounds across sequential calls)**

API routes often create hidden waterfalls when multiple database queries or external API calls are chained sequentially.

#### ❌ Incorrect

```tsx
export async function GET() {
  const user = await db.user.findUnique({ where: { id: 1 } });
  const posts = await db.post.findMany({ where: { authorId: user.id } });
  return Response.json({ user, posts });
}
```

#### ✅ Correct

```tsx
export async function GET() {
  const [user, posts] = await Promise.all([
    db.user.findUnique({ where: { id: 1 } }),
    db.post.findMany({ where: { authorId: 1 } })
  ]);
  return Response.json({ user, posts });
}
```

**Why:** Database queries over network can take 10-50ms each. Running them in parallel cuts latency in half.

---

### 1.4 Promise.all() for Independent Operations

**Impact: CRITICAL (cumulative across entire app)**

When operations don't depend on each other's results, always use `Promise.all()` to run them in parallel.

#### ❌ Incorrect

```tsx
const user = await fetchUser();
const settings = await fetchSettings();
const notifications = await fetchNotifications();
```

**Cost:** If each fetch takes 100ms, total = 300ms.

#### ✅ Correct

```tsx
const [user, settings, notifications] = await Promise.all([
  fetchUser(),
  fetchSettings(),
  fetchNotifications()
]);
```

**Benefit:** Total time = 100ms (the slowest operation), saving 200ms.

---

### 1.5 Strategic Suspense Boundaries

**Impact: HIGH (enables streaming and early interactivity)**

Place `<Suspense>` boundaries around independent async components to let them render as soon as their data arrives, rather than waiting for all data.

#### ❌ Incorrect

```tsx
async function Page() {
  const user = await fetchUser();
  const posts = await fetchPosts();
  return (
    <>
      <UserProfile user={user} />
      <PostList posts={posts} />
    </>
  );
}
```

**Problem:** Nothing renders until both fetches complete.

#### ✅ Correct

```tsx
function Page() {
  return (
    <>
      <Suspense fallback={<UserSkeleton />}>
        <UserProfile />
      </Suspense>
      <Suspense fallback={<PostsSkeleton />}>
        <PostList />
      </Suspense>
    </>
  );
}

async function UserProfile() {
  const user = await fetchUser();
  return <div>{user.name}</div>;
}

async function PostList() {
  const posts = await fetchPosts();
  return <div>{posts.length} posts</div>;
}
```

**Why:** Each component fetches and renders independently. UserProfile can appear before PostList finishes, improving perceived performance.

---

## 2. Bundle Size Optimization

**Impact: CRITICAL**

Bundle size directly affects initial load time and parsing cost. Modern libraries often contain hundreds of modules; importing incorrectly can bloat bundles by megabytes.

### 2.1 Avoid Barrel File Imports

**Impact: CRITICAL (can save 100-500KB per library)**

Barrel files (index.ts that re-export everything) prevent tree-shaking. Importing from them pulls in the entire library even if you only use one function.

#### ❌ Incorrect

```tsx
import { Button } from '@/components'; // imports ALL components
import { formatDate } from 'date-fns'; // imports entire library (10,000+ re-exports)
```

**Cost:** Can increase bundle by 200-500KB.

#### ✅ Correct

```tsx
// Option 1: Direct import
import { Button } from '@/components/Button';
import { formatDate } from 'date-fns/formatDate';

// Option 2: Configure Next.js optimizePackageImports
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['date-fns', '@/components']
  }
};

// Then use barrel imports safely:
import { Button } from '@/components';
import { formatDate } from 'date-fns';
```

**Why:** Direct imports or `optimizePackageImports` ensure only the required code is bundled.

**Reference:** [How We Optimized Package Imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)

---

### 2.2 Conditional Module Loading

**Impact: MEDIUM-HIGH (defers heavy modules)**

Load large dependencies only when needed, not at module initialization time.

#### ❌ Incorrect

```tsx
import { parse } from 'yaml'; // ~50KB parsed immediately

function Component({ data }) {
  if (!data) return null;
  const parsed = parse(data);
  return <div>{parsed.title}</div>;
}
```

#### ✅ Correct

```tsx
function Component({ data }) {
  if (!data) return null;

  const { parse } = require('yaml'); // or dynamic import
  const parsed = parse(data);
  return <div>{parsed.title}</div>;
}
```

**Why:** If `data` is null 90% of the time, you avoid loading/parsing yaml in most renders.

---

### 2.3 Defer Non-Critical Third-Party Libraries

**Impact: HIGH (improves TTI by 100-300ms)**

Load analytics, chat widgets, and other non-critical third-party scripts after the page becomes interactive.

#### ❌ Incorrect

```tsx
import { useEffect } from 'react';

export default function Layout({ children }) {
  useEffect(() => {
    import('analytics-lib').then(m => m.init());
  }, []);
  return <>{children}</>;
}
```

**Problem:** Script still loads during page load, competing for bandwidth.

#### ✅ Correct

```tsx
import { useEffect } from 'react';

export default function Layout({ children }) {
  useEffect(() => {
    // Defer until browser idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        import('analytics-lib').then(m => m.init());
      });
    } else {
      setTimeout(() => {
        import('analytics-lib').then(m => m.init());
      }, 1000);
    }
  }, []);
  return <>{children}</>;
}
```

**Why:** Defers the import until the browser is idle, ensuring it doesn't block critical rendering.

---

### 2.4 Dynamic Imports for Heavy Components

**Impact: HIGH (reduces initial bundle by 50-200KB per component)**

Use `next/dynamic` or `React.lazy()` to code-split large components that aren't needed immediately.

#### ❌ Incorrect

```tsx
import RichTextEditor from '@/components/RichTextEditor'; // 150KB

export default function Page() {
  const [editing, setEditing] = useState(false);
  return (
    <>
      {editing && <RichTextEditor />}
    </>
  );
}
```

#### ✅ Correct

```tsx
import dynamic from 'next/dynamic';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), {
  loading: () => <p>Loading editor...</p>
});

export default function Page() {
  const [editing, setEditing] = useState(false);
  return (
    <>
      {editing && <RichTextEditor />}
    </>
  );
}
```

**Why:** The editor code only loads when `editing` becomes true, saving 150KB on initial load.

---

### 2.5 Preload Based on User Intent

**Impact: MEDIUM (balances load time with UX)**

Preload heavy resources when user shows intent (hover, focus) rather than eagerly or on-demand.

#### ❌ Incorrect

```tsx
function Page() {
  return <Link href="/dashboard">Dashboard</Link>;
  // No preload; clicking incurs full load latency
}
```

#### ✅ Correct

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function Page() {
  const [preloadDashboard, setPreloadDashboard] = useState(false);

  useEffect(() => {
    if (preloadDashboard) {
      import('@/app/dashboard/page'); // prefetch route
    }
  }, [preloadDashboard]);

  return (
    <Link
      href="/dashboard"
      onMouseEnter={() => setPreloadDashboard(true)}
    >
      Dashboard
    </Link>
  );
}
```

**Why:** Prefetches the route when user hovers, reducing perceived latency without bloating initial load.

---

## 3. Server-Side Performance

**Impact: HIGH**

Server components and actions introduce new optimization opportunities and pitfalls around caching, serialization, and parallelization.

### 3.1 Authenticate Server Actions Like API Routes

**Impact: CRITICAL (security + correctness)**

Never rely on client-side guards for authorization. Server Actions are callable from anywhere; always verify permissions server-side.

#### ❌ Incorrect

```tsx
// app/actions.ts
'use server';

export async function deletePost(id: string) {
  await db.post.delete({ where: { id } });
}

// app/page.tsx
function Post({ post, isAdmin }) {
  return (
    <>
      {isAdmin && (
        <button onClick={() => deletePost(post.id)}>Delete</button>
      )}
    </>
  );
}
```

**Vulnerability:** Anyone can call `deletePost(id)` directly from browser DevTools.

#### ✅ Correct

```tsx
// app/actions.ts
'use server';

import { auth } from '@/lib/auth';

export async function deletePost(id: string) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    throw new Error('Unauthorized');
  }
  await db.post.delete({ where: { id } });
}
```

**Why:** Server-side authentication ensures security regardless of client state.

---

### 3.2 Avoid Duplicate Serialization in RSC Props

**Impact: MEDIUM (saves bandwidth and CPU)**

Don't pass the same large object to multiple child components; fetch it once at the parent level.

#### ❌ Incorrect

```tsx
async function Page() {
  return (
    <>
      <Header />
      <UserProfile />
      <UserPosts />
    </>
  );
}

async function UserProfile() {
  const user = await fetchUser(); // fetched
  return <div>{user.name}</div>;
}

async function UserPosts() {
  const user = await fetchUser(); // fetched again
  return <div>{user.posts.length} posts</div>;
}
```

**Problem:** `user` is fetched twice and serialized twice across RSC boundary.

#### ✅ Correct

```tsx
async function Page() {
  const user = await fetchUser();
  return (
    <>
      <Header />
      <UserProfile user={user} />
      <UserPosts user={user} />
    </>
  );
}

function UserProfile({ user }) {
  return <div>{user.name}</div>;
}

function UserPosts({ user }) {
  return <div>{user.posts.length} posts</div>;
}
```

**Alternative:** Use `React.cache()` for automatic deduplication (see 3.6).

---

### 3.3 Cross-Request LRU Caching

**Impact: MEDIUM-HIGH (reduces database load)**

For data that rarely changes and is frequently accessed, cache it across requests using an LRU cache.

#### ❌ Incorrect

```tsx
export async function fetchConfig() {
  return await db.config.findFirst(); // queries DB every request
}
```

#### ✅ Correct

```tsx
import { LRUCache } from 'lru-cache';

const cache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 5 // 5 minutes
});

export async function fetchConfig() {
  const cached = cache.get('config');
  if (cached) return cached;

  const config = await db.config.findFirst();
  cache.set('config', config);
  return config;
}
```

**Why:** Reduces database queries from every request to once per 5 minutes.

**Reference:** [node-lru-cache](https://github.com/isaacs/node-lru-cache)

---

### 3.4 Minimize Serialization at RSC Boundaries

**Impact: MEDIUM (reduces CPU and bandwidth)**

Only pass the data you actually need to child components. Large objects serialized across Server/Client boundaries add overhead.

#### ❌ Incorrect

```tsx
async function Page() {
  const user = await fetchUser(); // 50KB object with posts, comments, etc.
  return <ClientComponent user={user} />;
}
```

#### ✅ Correct

```tsx
async function Page() {
  const user = await fetchUser();
  return <ClientComponent name={user.name} avatar={user.avatar} />;
}
```

**Why:** Serializing 50KB vs 100 bytes saves CPU and bandwidth.

---

### 3.5 Parallel Data Fetching with Component Composition

**Impact: HIGH (enables concurrent fetching)**

Structure your RSC tree so independent data requirements can be fetched in parallel.

#### ❌ Incorrect

```tsx
async function Page() {
  const user = await fetchUser();
  const posts = await fetchPosts();
  return (
    <>
      <UserProfile user={user} />
      <PostList posts={posts} />
    </>
  );
}
```

**Problem:** Sequential awaits create a waterfall.

#### ✅ Correct

```tsx
function Page() {
  return (
    <>
      <Suspense fallback={<Skeleton />}>
        <UserProfile />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <PostList />
      </Suspense>
    </>
  );
}

async function UserProfile() {
  const user = await fetchUser();
  return <div>{user.name}</div>;
}

async function PostList() {
  const posts = await fetchPosts();
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

**Why:** Both components fetch in parallel, and each streams independently.

---

### 3.6 Per-Request Deduplication with React.cache()

**Impact: HIGH (eliminates redundant fetches within request)**

Wrap data fetching functions with `React.cache()` to automatically deduplicate calls within the same request.

#### ❌ Incorrect

```tsx
export async function fetchUser(id: string) {
  return await db.user.findUnique({ where: { id } });
}

// Multiple components call fetchUser(id) → multiple DB queries
```

#### ✅ Correct

```tsx
import { cache } from 'react';

export const fetchUser = cache(async (id: string) => {
  return await db.user.findUnique({ where: { id } });
});

// Multiple components call fetchUser(id) → single DB query per request
```

**Why:** `React.cache()` memoizes the result for the duration of the request, eliminating duplicate queries.

---

### 3.7 Use after() for Non-Blocking Operations

**Impact: MEDIUM (improves response time)**

Use Next.js `after()` to defer non-critical operations (logging, analytics) until after the response is sent.

#### ❌ Incorrect

```tsx
export async function POST(request: Request) {
  const data = await request.json();
  await db.log.create({ data: { action: 'create', data } }); // blocks response
  return Response.json({ success: true });
}
```

#### ✅ Correct

```tsx
import { after } from 'next/server';

export async function POST(request: Request) {
  const data = await request.json();

  after(async () => {
    await db.log.create({ data: { action: 'create', data } });
  });

  return Response.json({ success: true });
}
```

**Why:** Response is sent immediately; logging happens asynchronously without blocking the user.

---

## 4. Client-Side Data Fetching

**Impact: MEDIUM-HIGH**

Client-side fetching introduces challenges around deduplication, event listener efficiency, and storage optimization.

### 4.1 Deduplicate Global Event Listeners

**Impact: MEDIUM (prevents memory leaks)**

Global event listeners (window, document) should be registered once, not per component instance.

#### ❌ Incorrect

```tsx
function Component() {
  useEffect(() => {
    const handler = () => console.log('scroll');
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return <div />;
}

// If 10 instances mount, 10 listeners are registered
```

#### ✅ Correct

```tsx
// hooks/useScrollPosition.ts
let listeners = new Set<() => void>();
let registered = false;

function registerGlobalListener() {
  if (registered) return;
  registered = true;
  window.addEventListener('scroll', () => {
    listeners.forEach(fn => fn());
  });
}

export function useScrollPosition(callback: () => void) {
  useEffect(() => {
    registerGlobalListener();
    listeners.add(callback);
    return () => listeners.delete(callback);
  }, [callback]);
}

// Usage
function Component() {
  useScrollPosition(() => console.log('scroll'));
  return <div />;
}
```

**Why:** Single global listener notifies all subscribers, avoiding listener bloat.

---

### 4.2 Use Passive Event Listeners for Scrolling Performance

**Impact: MEDIUM (prevents jank)**

Mark scroll/touch listeners as passive to indicate they won't call `preventDefault()`, allowing the browser to optimize scrolling.

#### ❌ Incorrect

```tsx
useEffect(() => {
  const handler = (e) => {
    console.log(e.deltaY);
  };
  window.addEventListener('wheel', handler);
  return () => window.removeEventListener('wheel', handler);
}, []);
```

**Problem:** Browser must wait for handler to finish before scrolling, causing jank.

#### ✅ Correct

```tsx
useEffect(() => {
  const handler = (e) => {
    console.log(e.deltaY);
  };
  window.addEventListener('wheel', handler, { passive: true });
  return () => window.removeEventListener('wheel', handler);
}, []);
```

**Why:** `{ passive: true }` tells the browser it can scroll immediately without waiting for the handler.

---

### 4.3 Use SWR for Automatic Deduplication

**Impact: HIGH (eliminates redundant requests)**

Use SWR (or React Query) for data fetching to automatically deduplicate requests, cache results, and manage revalidation.

#### ❌ Incorrect

```tsx
function ComponentA() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser);
  }, []);
  return <div>{user?.name}</div>;
}

function ComponentB() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser);
  }, []);
  return <div>{user?.email}</div>;
}

// Both components fetch /api/user independently
```

#### ✅ Correct

```tsx
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function ComponentA() {
  const { data: user } = useSWR('/api/user', fetcher);
  return <div>{user?.name}</div>;
}

function ComponentB() {
  const { data: user } = useSWR('/api/user', fetcher);
  return <div>{user?.email}</div>;
}

// SWR deduplicates: only one request is made
```

**Why:** SWR shares data across components, eliminating redundant requests.

**Reference:** [SWR](https://swr.vercel.app)

---

### 4.4 Version and Minimize localStorage Data

**Impact: LOW-MEDIUM (prevents bugs and improves parse time)**

Version your localStorage schema and only store essential data to avoid parsing overhead and schema migration issues.

#### ❌ Incorrect

```tsx
localStorage.setItem('user', JSON.stringify(largeUserObject));
```

**Problem:** If schema changes, old data causes bugs. Also, parsing large objects on every page load is slow.

#### ✅ Correct

```tsx
const STORAGE_VERSION = 1;

function saveUser(user: User) {
  const data = {
    version: STORAGE_VERSION,
    user: {
      id: user.id,
      name: user.name
      // only store what you need
    }
  };
  localStorage.setItem('user', JSON.stringify(data));
}

function loadUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;

  const data = JSON.parse(raw);
  if (data.version !== STORAGE_VERSION) {
    localStorage.removeItem('user');
    return null;
  }

  return data.user;
}
```

**Why:** Versioning allows safe schema evolution; minimizing data reduces parse time.

---

## 5. Re-render Optimization

**Impact: MEDIUM**

Unnecessary re-renders compound throughout the component tree. Optimizing them improves responsiveness and reduces CPU usage.

### 5.1 Calculate Derived State During Rendering

**Impact: MEDIUM (eliminates unnecessary state)**

Don't store values that can be computed from existing state. Calculate them during render instead.

#### ❌ Incorrect

```tsx
function TodoList({ todos }) {
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    setCompletedCount(todos.filter(t => t.completed).length);
  }, [todos]);

  return <div>{completedCount} completed</div>;
}
```

**Problem:** Extra state + effect adds complexity and causes two renders (one for todos, one for completedCount).

#### ✅ Correct

```tsx
function TodoList({ todos }) {
  const completedCount = todos.filter(t => t.completed).length;
  return <div>{completedCount} completed</div>;
}
```

**Why:** Single render, no state synchronization bugs.

---

### 5.2 Defer State Reads to Usage Point

**Impact: MEDIUM (reduces unnecessary subscriptions)**

Read context or state only in components that use it, not at the top level.

#### ❌ Incorrect

```tsx
function Parent() {
  const theme = useContext(ThemeContext);
  return (
    <>
      <ComponentA />
      <ComponentB theme={theme} />
    </>
  );
}
```

**Problem:** Parent re-renders whenever theme changes, even though ComponentA doesn't use it.

#### ✅ Correct

```tsx
function Parent() {
  return (
    <>
      <ComponentA />
      <ComponentB />
    </>
  );
}

function ComponentB() {
  const theme = useContext(ThemeContext);
  return <div style={{ color: theme.color }} />;
}
```

**Why:** Only ComponentB re-renders on theme changes.

---

### 5.3 Do not wrap a simple expression with a primitive result type in useMemo

**Impact: LOW (avoid over-optimization)**

`useMemo` has overhead. Only use it for expensive computations or object/array creation.

#### ❌ Incorrect

```tsx
function Component({ a, b }) {
  const sum = useMemo(() => a + b, [a, b]);
  return <div>{sum}</div>;
}
```

**Problem:** `useMemo` overhead exceeds the cost of `a + b`.

#### ✅ Correct

```tsx
function Component({ a, b }) {
  const sum = a + b;
  return <div>{sum}</div>;
}
```

**Why:** Simple arithmetic is faster than memoization overhead.

---

### 5.4 Extract Default Non-primitive Parameter Value from Memoized Component to Constant

**Impact: MEDIUM (prevents memo invalidation)**

Default object/array props break memoization because they create new references on every render.

#### ❌ Incorrect

```tsx
const MemoizedComponent = memo(function Component({ items = [] }) {
  return <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>;
});

function Parent() {
  return <MemoizedComponent />; // [] is created on every render, breaking memo
}
```

#### ✅ Correct

```tsx
const EMPTY_ARRAY = [];

const MemoizedComponent = memo(function Component({ items = EMPTY_ARRAY }) {
  return <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>;
});
```

**Why:** `EMPTY_ARRAY` has a stable reference, allowing memo to work correctly.

---

### 5.5 Extract to Memoized Components

**Impact: MEDIUM-HIGH (prevents cascading re-renders)**

Wrap expensive or frequently updated subtrees in `React.memo()` to prevent unnecessary re-renders.

#### ❌ Incorrect

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(count + 1)}>{count}</button>
      <ExpensiveChild />
    </>
  );
}

function ExpensiveChild() {
  // expensive rendering logic
  return <div>...</div>;
}
```

**Problem:** `ExpensiveChild` re-renders on every count change even though it doesn't use count.

#### ✅ Correct

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(count + 1)}>{count}</button>
      <MemoizedExpensiveChild />
    </>
  );
}

const MemoizedExpensiveChild = memo(function ExpensiveChild() {
  return <div>...</div>;
});
```

**Why:** `ExpensiveChild` only re-renders if its props change.

---

### 5.6 Narrow Effect Dependencies

**Impact: MEDIUM (reduces effect runs)**

Only include values you actually use in the effect. Reading entire objects when you only need one property causes unnecessary re-runs.

#### ❌ Incorrect

```tsx
function Component({ user }) {
  useEffect(() => {
    console.log(user.name);
  }, [user]); // re-runs whenever any user property changes
}
```

#### ✅ Correct

```tsx
function Component({ user }) {
  const { name } = user;
  useEffect(() => {
    console.log(name);
  }, [name]); // only re-runs when name changes
}
```

**Why:** Effect runs less frequently, improving performance.

---

### 5.7 Put Interaction Logic in Event Handlers

**Impact: MEDIUM (simplifies component logic)**

Prefer event handlers over effects for logic triggered by user actions.

#### ❌ Incorrect

```tsx
function Form() {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted) {
      fetch('/api/submit', { method: 'POST' });
    }
  }, [submitted]);

  return <button onClick={() => setSubmitted(true)}>Submit</button>;
}
```

**Problem:** Indirection through state makes code harder to follow.

#### ✅ Correct

```tsx
function Form() {
  const handleSubmit = () => {
    fetch('/api/submit', { method: 'POST' });
  };

  return <button onClick={handleSubmit}>Submit</button>;
}
```

**Why:** Direct event handler is clearer and eliminates unnecessary state.

---

### 5.8 Subscribe to Derived State

**Impact: MEDIUM (avoids redundant subscriptions)**

When deriving state from external sources, subscribe to the minimal necessary data.

#### ❌ Incorrect

```tsx
function Component() {
  const [store, setStore] = useState(externalStore.getState());

  useEffect(() => {
    const unsubscribe = externalStore.subscribe(() => {
      setStore(externalStore.getState()); // full state update
    });
    return unsubscribe;
  }, []);

  return <div>{store.user.name}</div>;
}
```

#### ✅ Correct

```tsx
function Component() {
  const userName = useSyncExternalStore(
    externalStore.subscribe,
    () => externalStore.getState().user.name
  );

  return <div>{userName}</div>;
}
```

**Why:** Component only re-renders when `user.name` changes, not on any store change.

---

### 5.9 Use Functional setState Updates

**Impact: HIGH (prevents stale closure bugs)**

When new state depends on previous state, use the functional form of setState to avoid stale closures.

#### ❌ Incorrect

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setTimeout(() => {
      setCount(count + 1); // stale count if clicked multiple times
    }, 1000);
  };

  return <button onClick={handleClick}>{count}</button>;
}
```

**Problem:** Multiple rapid clicks use the same stale `count` value.

#### ✅ Correct

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setTimeout(() => {
      setCount(c => c + 1); // always uses latest count
    }, 1000);
  };

  return <button onClick={handleClick}>{count}</button>;
}
```

**Why:** Functional update always receives the latest state.

---

### 5.10 Use Lazy State Initialization

**Impact: MEDIUM (avoids repeated expensive computation)**

If initial state requires expensive computation, use the lazy initializer form.

#### ❌ Incorrect

```tsx
function Component() {
  const [data, setData] = useState(expensiveComputation());
  // expensiveComputation() runs on every render
  return <div>{data}</div>;
}
```

#### ✅ Correct

```tsx
function Component() {
  const [data, setData] = useState(() => expensiveComputation());
  // expensiveComputation() runs only on first render
  return <div>{data}</div>;
}
```

**Why:** Lazy initializer runs only once, saving CPU on subsequent renders.

---

### 5.11 Use Transitions for Non-Urgent Updates

**Impact: MEDIUM (improves responsiveness)**

Mark non-urgent state updates as transitions to keep the UI responsive during heavy rendering.

#### ❌ Incorrect

```tsx
function SearchPage() {
  const [query, setQuery] = useState('');
  const results = performExpensiveSearch(query);

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <Results items={results} />
    </>
  );
}
```

**Problem:** Typing in the input feels sluggish because React blocks to render results.

#### ✅ Correct

```tsx
function SearchPage() {
  const [query, setQuery] = useState('');
  const [deferredQuery, setDeferredQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    startTransition(() => {
      setDeferredQuery(value);
    });
  };

  const results = performExpensiveSearch(deferredQuery);

  return (
    <>
      <input value={query} onChange={handleChange} />
      {isPending && <div>Searching...</div>}
      <Results items={results} />
    </>
  );
}
```

**Why:** Input updates immediately; search results render in the background without blocking.

---

### 5.12 Use useRef for Transient Values

**Impact: MEDIUM (avoids unnecessary re-renders)**

Use `useRef` for values that should persist across renders but don't trigger re-renders when changed.

#### ❌ Incorrect

```tsx
function Component() {
  const [renderCount, setRenderCount] = useState(0);

  useEffect(() => {
    setRenderCount(c => c + 1); // causes infinite loop!
  });

  return <div>Rendered {renderCount} times</div>;
}
```

#### ✅ Correct

```tsx
function Component() {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
  });

  return <div>Rendered {renderCount.current} times</div>;
}
```

**Why:** `useRef` updates don't cause re-renders, avoiding the infinite loop.

---

## 6. Rendering Performance

**Impact: MEDIUM**

These optimizations reduce browser layout/paint cost and improve animation smoothness.

### 6.1 Animate SVG Wrapper Instead of SVG Element

**Impact: LOW-MEDIUM (smoother animations)**

Animating transform on a wrapper div is faster than animating SVG attributes directly.

#### ❌ Incorrect

```tsx
<svg style={{ transform: `rotate(${angle}deg)` }}>
  <circle r="50" />
</svg>
```

#### ✅ Correct

```tsx
<div style={{ transform: `rotate(${angle}deg)` }}>
  <svg>
    <circle r="50" />
  </svg>
</div>
```

**Why:** Browser can use compositor for div transforms; SVG attribute changes require expensive re-rendering.

---

### 6.2 CSS content-visibility for Long Lists

**Impact: HIGH (dramatically improves scroll performance)**

Use `content-visibility: auto` to skip rendering off-screen content.

#### ❌ Incorrect

```tsx
function LongList({ items }) {
  return (
    <div>
      {items.map(item => (
        <div key={item.id} className="item">
          <ExpensiveComponent data={item} />
        </div>
      ))}
    </div>
  );
}
```

#### ✅ Correct

```tsx
function LongList({ items }) {
  return (
    <div>
      {items.map(item => (
        <div key={item.id} className="item" style={{ contentVisibility: 'auto' }}>
          <ExpensiveComponent data={item} />
        </div>
      ))}
    </div>
  );
}
```

**Why:** Browser skips layout/paint for off-screen items, improving scroll performance by 5-10x.

---

### 6.3 Hoist Static JSX Elements

**Impact: MEDIUM (reduces reconciliation work)**

Move static JSX outside the component body to avoid re-creating it on every render.

#### ❌ Incorrect

```tsx
function Component({ user }) {
  return (
    <>
      <header>
        <h1>My App</h1>
      </header>
      <div>{user.name}</div>
    </>
  );
}
```

**Problem:** Header JSX is re-created on every render even though it never changes.

#### ✅ Correct

```tsx
const HEADER = (
  <header>
    <h1>My App</h1>
  </header>
);

function Component({ user }) {
  return (
    <>
      {HEADER}
      <div>{user.name}</div>
    </>
  );
}
```

**Why:** React skips reconciling `HEADER` since it's referentially stable.

---

### 6.4 Optimize SVG Precision

**Impact: LOW (reduces SVG size)**

Limit decimal precision in SVG paths to reduce file size.

#### ❌ Incorrect

```tsx
<path d="M10.123456789,20.987654321 L30.111111111,40.222222222" />
```

#### ✅ Correct

```tsx
<path d="M10.12,20.99 L30.11,40.22" />
```

**Why:** Sub-pixel precision is imperceptible; reducing it saves bytes.

---

### 6.5 Prevent Hydration Mismatch Without Flickering

**Impact: MEDIUM (improves UX)**

For client-only content (timestamps, random values), inject it synchronously before React hydrates to avoid visible flicker.

#### ❌ Incorrect

```tsx
function Component() {
  const [timestamp, setTimestamp] = useState(null);

  useEffect(() => {
    setTimestamp(Date.now());
  }, []);

  return <div>{timestamp || 'Loading...'}</div>;
}
```

**Problem:** Shows "Loading..." briefly, then flickers to actual time.

#### ✅ Correct

```tsx
// Inject timestamp synchronously in <head> before hydration
<script dangerouslySetInnerHTML={{
  __html: `window.__TIMESTAMP = ${Date.now()};`
}} />

function Component() {
  const [timestamp] = useState(() => window.__TIMESTAMP);
  return <div>{timestamp}</div>;
}
```

**Why:** Value is available before React hydrates, preventing flicker.

---

### 6.6 Suppress Expected Hydration Mismatches

**Impact: LOW (cleaner console)**

Use `suppressHydrationWarning` for intentional mismatches like timestamps.

#### ❌ Incorrect

```tsx
function Component() {
  const timestamp = new Date().toISOString();
  return <div>{timestamp}</div>; // hydration warning
}
```

#### ✅ Correct

```tsx
function Component() {
  const timestamp = new Date().toISOString();
  return <div suppressHydrationWarning>{timestamp}</div>;
}
```

**Why:** Silences expected warning, keeping console clean for real issues.

---

### 6.7 Use Activity Component for Show/Hide

**Impact: LOW-MEDIUM (preserves state)**

Use `display: none` instead of conditional rendering to hide components while preserving their state.

#### ❌ Incorrect

```tsx
function Tabs({ activeTab }) {
  return (
    <>
      {activeTab === 'a' && <TabA />}
      {activeTab === 'b' && <TabB />}
    </>
  );
}
```

**Problem:** Switching tabs unmounts and remounts components, losing state.

#### ✅ Correct

```tsx
function Tabs({ activeTab }) {
  return (
    <>
      <div style={{ display: activeTab === 'a' ? 'block' : 'none' }}>
        <TabA />
      </div>
      <div style={{ display: activeTab === 'b' ? 'block' : 'none' }}>
        <TabB />
      </div>
    </>
  );
}
```

**Why:** Components remain mounted, preserving state and avoiding remount cost.

---

### 6.8 Use Explicit Conditional Rendering

**Impact: LOW (clearer intent)**

Use ternary or explicit conditionals instead of `&&` for conditional rendering to avoid rendering `0` or `NaN`.

#### ❌ Incorrect

```tsx
function Component({ count }) {
  return <div>{count && <span>{count} items</span>}</div>;
}
```

**Problem:** If `count` is 0, renders "0" instead of nothing.

#### ✅ Correct

```tsx
function Component({ count }) {
  return <div>{count > 0 ? <span>{count} items</span> : null}</div>;
}
```

**Why:** Explicit conditional prevents unexpected `0` rendering.

---

### 6.9 Use useTransition Over Manual Loading States

**Impact: MEDIUM (simplifies code)**

Use `useTransition` instead of manually managing loading states for async UI updates.

#### ❌ Incorrect

```tsx
function Component() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const result = await fetchData();
    setData(result);
    setLoading(false);
  };

  return (
    <>
      <button onClick={handleClick}>Load</button>
      {loading && <div>Loading...</div>}
      {data && <div>{data}</div>}
    </>
  );
}
```

#### ✅ Correct

```tsx
function Component() {
  const [data, setData] = useState(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await fetchData();
      setData(result);
    });
  };

  return (
    <>
      <button onClick={handleClick}>Load</button>
      {isPending && <div>Loading...</div>}
      {data && <div>{data}</div>}
    </>
  );
}
```

**Why:** `useTransition` automatically manages pending state and keeps UI responsive.

---

## 7. JavaScript Performance

**Impact: LOW-MEDIUM**

Micro-optimizations for hot code paths. Apply judiciously where profiling shows they matter.

### 7.1 Avoid Layout Thrashing

**Impact: MEDIUM (prevents forced reflows)**

Batch DOM reads together and DOM writes together to avoid forced synchronous layouts.

#### ❌ Incorrect

```tsx
elements.forEach(el => {
  const height = el.offsetHeight; // read
  el.style.height = height + 10 + 'px'; // write
  // read-write-read-write causes layout thrashing
});
```

#### ✅ Correct

```tsx
const heights = elements.map(el => el.offsetHeight); // batch reads
elements.forEach((el, i) => {
  el.style.height = heights[i] + 10 + 'px'; // batch writes
});
```

**Why:** Browser can optimize batched reads/writes instead of recalculating layout repeatedly.

---

### 7.2 Build Index Maps for Repeated Lookups

**Impact: MEDIUM (O(1) instead of O(n) lookups)**

Convert arrays to maps when doing repeated lookups.

#### ❌ Incorrect

```tsx
const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
const user = users.find(u => u.id === userId); // O(n)
```

#### ✅ Correct

```tsx
const usersById = new Map(users.map(u => [u.id, u]));
const user = usersById.get(userId); // O(1)
```

**Why:** Map lookup is O(1) vs O(n) for array find.

---

### 7.3 Cache Property Access in Loops

**Impact: LOW-MEDIUM (reduces lookups)**

Hoist repeated property accesses out of loops.

#### ❌ Incorrect

```tsx
for (let i = 0; i < items.length; i++) {
  console.log(items[i]);
}
```

#### ✅ Correct

```tsx
const len = items.length;
for (let i = 0; i < len; i++) {
  console.log(items[i]);
}
```

**Why:** Avoids re-reading `items.length` on every iteration.

---

### 7.4 Cache Repeated Function Calls

**Impact: MEDIUM (avoids redundant computation)**

Memoize expensive function results.

#### ❌ Incorrect

```tsx
function Component({ data }) {
  return (
    <div>
      <Chart data={processData(data)} />
      <Table data={processData(data)} />
    </div>
  );
}
```

#### ✅ Correct

```tsx
function Component({ data }) {
  const processed = useMemo(() => processData(data), [data]);
  return (
    <div>
      <Chart data={processed} />
      <Table data={processed} />
    </div>
  );
}
```

**Why:** `processData` runs once instead of twice.

---

### 7.5 Cache Storage API Calls

**Impact: MEDIUM (reduces async overhead)**

Cache results of localStorage/sessionStorage reads.

#### ❌ Incorrect

```tsx
function Component() {
  const theme = localStorage.getItem('theme');
  const lang = localStorage.getItem('lang');
  // reads storage on every render
}
```

#### ✅ Correct

```tsx
function Component() {
  const [theme] = useState(() => localStorage.getItem('theme'));
  const [lang] = useState(() => localStorage.getItem('lang'));
  // reads storage once
}
```

**Why:** Storage access is synchronous but relatively slow; caching reduces overhead.

---

### 7.6 Combine Multiple Array Iterations

**Impact: MEDIUM (reduces iterations from N to 1)**

Combine multiple passes over the same array into one.

#### ❌ Incorrect

```tsx
const filtered = items.filter(i => i.active);
const mapped = filtered.map(i => i.name);
const upperCased = mapped.map(n => n.toUpperCase());
```

#### ✅ Correct

```tsx
const result = items
  .filter(i => i.active)
  .map(i => i.name.toUpperCase());
```

**Why:** Single pass instead of three.

---

### 7.7 Early Length Check for Array Comparisons

**Impact: LOW (cheap early exit)**

Check array lengths before deep comparison.

#### ❌ Incorrect

```tsx
function arraysEqual(a, b) {
  return a.every((val, i) => val === b[i]);
}
```

#### ✅ Correct

```tsx
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}
```

**Why:** Length check is O(1); if lengths differ, avoids O(n) comparison.

---

### 7.8 Early Return from Functions

**Impact: LOW (clearer and faster)**

Return early when possible to avoid unnecessary computation.

#### ❌ Incorrect

```tsx
function process(data) {
  if (data) {
    // expensive processing
    return result;
  } else {
    return null;
  }
}
```

#### ✅ Correct

```tsx
function process(data) {
  if (!data) return null;

  // expensive processing
  return result;
}
```

**Why:** Avoids nesting and skips expensive code when data is null.

---

### 7.9 Hoist RegExp Creation

**Impact: LOW-MEDIUM (avoids repeated compilation)**

Create regexps outside loops or function bodies.

#### ❌ Incorrect

```tsx
function validate(items) {
  return items.filter(item => {
    const regex = /^[A-Z]/;
    return regex.test(item);
  });
}
```

#### ✅ Correct

```tsx
const STARTS_WITH_UPPERCASE = /^[A-Z]/;

function validate(items) {
  return items.filter(item => STARTS_WITH_UPPERCASE.test(item));
}
```

**Why:** Regexp is compiled once instead of per item.

---

### 7.10 Use Loop for Min/Max Instead of Sort

**Impact: MEDIUM (O(n) instead of O(n log n))**

Find min/max with a loop instead of sorting.

#### ❌ Incorrect

```tsx
const max = numbers.sort((a, b) => b - a)[0]; // O(n log n)
```

#### ✅ Correct

```tsx
const max = Math.max(...numbers); // O(n)
```

**Why:** Finding max is O(n); sorting is O(n log n).

---

### 7.11 Use Set/Map for O(1) Lookups

**Impact: HIGH (O(1) instead of O(n))**

Use Set/Map for membership tests instead of arrays.

#### ❌ Incorrect

```tsx
const allowedIds = [1, 2, 3, 4, 5];
if (allowedIds.includes(userId)) { ... } // O(n)
```

#### ✅ Correct

```tsx
const allowedIds = new Set([1, 2, 3, 4, 5]);
if (allowedIds.has(userId)) { ... } // O(1)
```

**Why:** Set lookup is O(1) vs O(n) for array includes.

---

### 7.12 Use toSorted() Instead of sort() for Immutability

**Impact: LOW (clearer intent, safer)**

Use `toSorted()` to avoid mutating original array.

#### ❌ Incorrect

```tsx
const sorted = [...items].sort(); // extra copy
```

#### ✅ Correct

```tsx
const sorted = items.toSorted(); // built-in immutable sort
```

**Why:** `toSorted()` is clearer and avoids manual copying.

---

## 8. Advanced Patterns

**Impact: LOW**

Specialized techniques for edge cases. Use sparingly and only when profiling shows they help.

### 8.1 Initialize App Once, Not Per Mount

**Impact: MEDIUM (prevents duplicate initialization)**

Global initialization (analytics, third-party SDKs) should happen once per page load, not per component mount.

#### ❌ Incorrect

```tsx
function App() {
  useEffect(() => {
    initializeAnalytics(); // runs on every mount
  }, []);
  return <div>...</div>;
}
```

#### ✅ Correct

```tsx
let initialized = false;

function App() {
  useEffect(() => {
    if (!initialized) {
      initialized = true;
      initializeAnalytics();
    }
  }, []);
  return <div>...</div>;
}
```

**Why:** Prevents re-initialization if component unmounts and remounts (e.g., during React Router transitions).

---

### 8.2 Store Event Handlers in Refs

**Impact: LOW (avoids effect re-runs)**

Store event handlers in refs to avoid removing/re-adding event listeners when handler changes.

#### ❌ Incorrect

```tsx
function Component({ onEvent }) {
  useEffect(() => {
    window.addEventListener('resize', onEvent);
    return () => window.removeEventListener('resize', onEvent);
  }, [onEvent]); // re-runs every time onEvent changes
}
```

#### ✅ Correct

```tsx
function Component({ onEvent }) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const handler = () => onEventRef.current();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []); // runs once
}
```

**Why:** Listener is registered once; ref always points to latest handler.

---

### 8.3 useEffectEvent for Stable Callback Refs

**Impact: LOW (future React feature)**

Once available, use `useEffectEvent` to create stable callbacks that always reference latest props/state.

#### ❌ Incorrect (current approach)

```tsx
function Component({ onEvent }) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const handler = () => onEventRef.current();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
}
```

#### ✅ Correct (future)

```tsx
import { useEffectEvent } from 'react';

function Component({ onEvent }) {
  const onResize = useEffectEvent(onEvent);

  useEffect(() => {
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
}
```

**Why:** `useEffectEvent` provides stable references without manual ref management.

---

## References

- [React Documentation](https://react.dev)
- [Next.js Documentation](https://nextjs.org)
- [SWR](https://swr.vercel.app)
- [better-all](https://github.com/shuding/better-all)
- [node-lru-cache](https://github.com/isaacs/node-lru-cache)
- [How We Optimized Package Imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [How We Made the Vercel Dashboard Twice as Fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)

---

**Document Version:** 1.0.0
**Last Updated:** January 2026
**Maintained by:** Vercel Engineering

---

## Quick Checklist

When reviewing React/Next.js code, prioritize in this order:

1. ✅ **Eliminate waterfalls** - Check for sequential awaits, missing Promise.all()
2. ✅ **Avoid barrel imports** - Use direct imports or optimizePackageImports
3. ✅ **Use React.cache()** - Deduplicate server-side data fetching
4. ✅ **Authenticate Server Actions** - Never trust client-side guards
5. ✅ **Functional setState** - Use `setState(c => c + 1)` for state updates
6. ✅ **Memoize expensive components** - Use React.memo() for large subtrees
7. ✅ **Use SWR/React Query** - Deduplicate client-side requests
8. ✅ **Dynamic imports** - Code-split heavy components
9. ✅ **Transitions** - Use startTransition for non-urgent updates
10. ✅ **Derive state during render** - Avoid unnecessary useState + useEffect

---

*This document is designed for AI agents. For questions or contributions, see the [repository](https://github.com/vercel-labs/agent-skills).*
