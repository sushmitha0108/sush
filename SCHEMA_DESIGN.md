# MongoDB Schema Design

## Collections Overview

- `users` — both admins and students (differentiated by `role`)
- `events`
- `registrations` — join between a student and an event, plus QR/attendance/certificate state
- `feedback`

---

## `users`

| Field | Type | Notes |
|---|---|---|
| name | String | required, alphabets only, min 2 chars |
| email | String | required, unique, lowercase |
| password | String | required, bcrypt-hashed, `select: false` |
| phone | String | 10 digits |
| role | String | `admin` \| `student` |
| department | String | |
| year | Number | required for students, one of 1-4 |
| rollNumber | String | |
| interests | [String] | used by the recommendation engine |
| avatar | String | uploaded file path |
| isActive | Boolean | default true; admin can deactivate |
| timestamps | Date | createdAt / updatedAt |

**Indexes:** unique index on `email`.

---

## `events`

| Field | Type | Notes |
|---|---|---|
| name | String | required, min 3 chars |
| description | String | required |
| category | String | enum: Technical, Cultural, Sports, Workshop, Seminar, Hackathon, Other |
| department | String | required |
| date | Date | required |
| time | String | required, e.g. "14:30" |
| venue | String | required |
| registrationDeadline | Date | required, must be ≤ event date |
| maxParticipants | Number | required, ≥ 1 |
| availableSeats | Number | auto-initialized to maxParticipants, decremented atomically |
| image | String | uploaded file path |
| organizer | String | required |
| createdBy | ObjectId → users | admin who created the event |
| isCancelled | Boolean | default false |
| tags | [String] | used by the recommendation engine |
| timestamps | Date | |

**Indexes:** text index on `name`, `description`, `tags` (search); compound index on `category, date` (filtering).

---

## `registrations`

| Field | Type | Notes |
|---|---|---|
| student | ObjectId → users | required |
| event | ObjectId → events | required |
| status | String | `pending` \| `approved` \| `rejected` \| `cancelled` |
| qrCode | String | unique token embedded in the QR image |
| qrCodeImage | String | path to generated PNG |
| attendance.isPresent | Boolean | default false |
| attendance.markedAt | Date | |
| certificate.isGenerated | Boolean | default false |
| certificate.filePath | String | |
| certificate.generatedAt | Date | |
| cancelledAt | Date | |
| timestamps | Date | |

**Indexes:** unique compound index on `(student, event)` — this is the primary
mechanism (backed up by an application-level check) that prevents duplicate
registrations and produces the required `409` response. Unique index on `qrCode`.

---

## `feedback`

| Field | Type | Notes |
|---|---|---|
| student | ObjectId → users | required |
| event | ObjectId → events | required |
| registration | ObjectId → registrations | required |
| rating | Number | required, 1-5 |
| comment | String | max 1000 chars |
| timestamps | Date | `createdAt` doubles as the required feedback date |

**Indexes:** unique compound index on `(student, event)` — one feedback per student per event.

---

## Relationships

```
User (student) 1 ──── N Registration N ──── 1 Event
User (student) 1 ──── N Feedback      N ──── 1 Event
Registration    1 ──── 1 Feedback
Event           N ──── 1 User (admin, via createdBy)
```

## Why a join collection (`registrations`) instead of embedding

Registrations are modeled as their own collection rather than an array embedded in
`Event` or `User` because:
- Seat-count updates need atomic, transaction-safe increments/decrements independent of
  document size.
- Each registration carries its own growing sub-state (QR, attendance, certificate) that
  would bloat the parent document if embedded.
- It needs to be queried from both directions efficiently (a student's events, and an
  event's participants) — a dedicated collection with two indexes handles both cleanly.
