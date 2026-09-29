# MeetMind — Complete Meeting Flow & Feature Requirements

We are developing an AI-powered online meeting application called **MeetMind**. The existing project already has the basic meeting functionality, host/participant flow, authentication, WebRTC/video meeting functionality, Node.js backend, MongoDB, and a separate Python FastAPI ML service. Do NOT rebuild the project from scratch. First understand the existing project structure and integrate these requirements into the current implementation without breaking existing functionality.

The main requirement is to create a controlled meeting system where the **Host has control over participants and AI analytics**, while **Participants have limited access and mainly receive the meeting summary**.

## 1. Host Creates and Publishes a Meeting

The Host should be able to create and publish a meeting.

After publishing the meeting, the Host should receive the required meeting credentials, such as:

* Meeting ID / meeting code
* Password or joining credential, if already supported
* Meeting link, if already supported

The Host can share these credentials with participants.

Only users with valid meeting credentials should be able to attempt to join the meeting.

## 2. Participant Joining Process

When a Participant enters the meeting credentials and tries to join, the system must check the participant's camera status.

Camera access should be **mandatory by default**.

The normal joining flow should be:

Participant enters meeting credentials → credentials are validated → camera permission/status is checked → if camera is ON/available, participant can join the meeting.

The participant should not be allowed to directly bypass the camera requirement.

## 3. Participant Cannot Turn On Camera

If a participant cannot enable their camera or has a valid reason for not using the camera, they should NOT simply be allowed into the meeting.

Instead, show a message such as:

"Camera access is required to join this meeting. If you have a valid reason for joining without camera access, you can request permission from the host."

Provide a button:

"Request Permission"

When the participant clicks this button, a camera exception request should be sent to the Host.

## 4. Host Camera Exception Permission

The Host should receive a notification/request when a participant asks to join without camera access.

The Host should be able to see:

* Participant name
* Participant information
* Camera permission request
* Reason/request message, if the participant provides one
* Accept button
* Reject button

If the Host clicks **Accept**, that participant is allowed to join the meeting without camera access.

If the Host clicks **Reject**, the participant should not be allowed to join without camera access.

This permission should be controlled by the backend and should not depend only on frontend JavaScript.

The participant's permission state should be stored and associated with that meeting and participant.

## 5. Different Permissions for Host and Participants

MeetMind must have clear role-based access.

### Host

The Host should be able to see participant-related AI analytics.

The Host should have access to information such as:

* Participant face visibility
* Face detection status
* Eye/attention-related information
* Engagement information
* Camera status
* Other existing AI meeting analytics already implemented in MeetMind

The Host should be able to monitor the participants during the meeting.

### Participant

Participants should NOT have access to the Host's participant analytics.

Participants should NOT be able to see:

* Other participants' face visibility analytics
* Other participants' eye/attention analytics
* Other participants' engagement analytics
* Host-only AI analytics
* Host controls

Participants should mainly have access to the normal meeting interface and the meeting summary.

The AI analytics must therefore be protected using proper backend role/permission checks, not only by hiding frontend elements.

## 6. Camera Must Remain ON During the Meeting

For participants who joined with normal camera access, the camera should remain ON during the meeting.

If a participant turns their camera OFF during the meeting, the system should immediately detect it.

When the camera becomes OFF:

1. Start a 30-second timer.
2. Show a clear warning to the participant.
3. Tell the participant to turn their camera back ON.
4. Give them 30 seconds to restore camera access.

Example message:

"Your camera is OFF. Please turn your camera ON within 30 seconds to continue participating in the meeting."

If the participant turns the camera ON within 30 seconds:

* Stop the timer.
* Reset the temporary warning state.
* Continue the meeting normally.

## 7. 30-Second Camera Grace Period

The 30-second period is a grace period.

The participant should not immediately be removed just because the camera temporarily becomes unavailable.

The system should allow the participant to recover their camera within 30 seconds.

The timer should be visible to the participant, for example:

"Camera must be enabled — 25 seconds remaining."

The timer should continue accurately even if the frontend UI refreshes or reconnects. The backend should be considered the source of truth for important enforcement logic.

## 8. Three Attempts Rule

Each participant should have a maximum of **3 camera-off/violation attempts** during a meeting.

The system should track the number of violations per participant.

Example:

First violation:

* Camera OFF
* 30-second warning
* Attempt 1

Second violation:

* Camera OFF
* 30-second warning
* Attempt 2

Third violation:

* Camera OFF
* 30-second warning
* Attempt 3

The participant should not receive unlimited attempts.

The attempt count should be stored/controlled by the backend so that refreshing the page does not reset the count.

The exact restriction after the third failed attempt should be implemented according to the existing MeetMind meeting rules, but the participant must not be able to bypass the three-attempt limit by refreshing the browser or reconnecting.

## 9. Participant Leaving the Meeting

If a participant intentionally leaves the meeting or repeatedly violates the camera requirement, the system should track the participant's attempts according to the 3-attempt rule.

When appropriate, show a warning such as:

"You have limited attempts remaining. Please return to the meeting and keep your camera enabled."

The participant should be informed that only 3 attempts are available.

Do not allow the participant to reset their attempt count by refreshing the page, reconnecting, or reopening the meeting.

## 10. Host Ends the Meeting

The Host has the authority to end the meeting.

When the Host clicks:

"End Meeting"

the meeting should be ended for EVERYONE.

The flow should be:

Host clicks End Meeting → backend changes meeting status to ENDED → all connected participants are notified → all participants are removed/disconnected from the active meeting → meeting UI is closed or moved to the meeting-ended screen.

Participants should not be able to continue the meeting after the Host has ended it.

If a participant tries to reconnect to the same meeting after the Host has ended it, the backend should reject the attempt because the meeting status is ENDED.

This must be controlled by the backend, not only by the frontend.

## 11. Meeting Status

Each meeting should have a proper state.

At minimum, support states such as:

* CREATED
* ACTIVE
* ENDED

The backend should maintain the actual meeting status.

The frontend should use the backend meeting status as the source of truth.

If the meeting is ENDED, participants must not be allowed to continue joining the meeting.

## 12. Meeting Summary

After the meeting is ended, MeetMind should process the available meeting information and generate the meeting summary using the existing AI summarization functionality.

Participants should be able to access the meeting summary after the meeting ends.

The summary can contain information such as:

* Main discussion points
* Important topics
* Key points
* Decisions discussed
* Action items
* Other information already supported by the existing MeetMind summarization system

Participants should only receive the summary and information that they are authorized to see.

Host-only AI analytics must remain separate from the participant summary.

## 13. Host and Participant Access Separation

The application must strictly separate Host and Participant permissions.

Host:

* Create meeting
* Publish meeting
* Receive meeting credentials
* Control meeting
* Accept/reject camera exception requests
* End meeting
* View participant AI analytics
* View face visibility
* View attention/eye information
* View engagement information
* Access other host-only analytics

Participant:

* Join using valid credentials
* Enable camera
* Request camera exception if necessary
* Participate in meeting
* Receive camera-off warnings
* Follow 30-second camera rule
* Have maximum 3 attempts
* View meeting summary after meeting ends
* Cannot access host-only participant analytics
* Cannot end the meeting for everyone

## 14. Backend Security Requirement

Do NOT implement important permissions only by hiding buttons or UI elements.

For example, hiding the analytics panel from participants is NOT enough.

The backend must verify:

* User role
* Meeting membership
* Host ownership
* Meeting status
* Camera permission exception
* Participant attempt count
* Whether the meeting is active
* Whether the participant is authorized to access specific data

Participants should not be able to call an API manually and retrieve Host-only AI analytics.

Similarly, participants should not be able to call an API to end a meeting unless they are the authorized Host.

## 15. Existing AI/ML Service

The existing MeetMind project already has a separate Python FastAPI ML service.

Do NOT replace the existing ML architecture unless absolutely necessary.

The existing AI functionality should continue to work.

The architecture should remain approximately:

Frontend → Node.js/Express Backend → Python FastAPI ML Service

The ML service can continue handling existing AI analysis such as:

* Face detection
* Face visibility
* Eye/attention detection
* Engagement estimation
* Other existing AI analysis

The backend should control who is allowed to receive the AI results.

The Host should receive the appropriate participant analytics.

Participants should not receive Host-only analytics.

## 16. WebRTC / Camera Detection

Use the existing WebRTC camera implementation where possible.

Do NOT unnecessarily create a completely new camera system.

The system should reliably detect:

* Camera enabled
* Camera disabled
* Camera permission denied
* Camera unavailable
* Video track stopped
* Participant disconnected

The existing meeting functionality must continue working.

The camera-off detection should integrate with the existing WebRTC implementation.

## 17. Real-Time Updates

The following events should ideally be real-time:

* Participant joins
* Participant leaves
* Camera status changes
* Camera permission request
* Host accepts permission
* Host rejects permission
* Camera warning
* Attempt count changes
* Host ends meeting
* Meeting-ended notification

Use the existing real-time communication mechanism in MeetMind if one already exists, such as WebSocket/Socket.IO/WebRTC signaling.

Do not introduce a second unnecessary real-time architecture if the project already has one.

## 18. Important Anti-Bypass Requirements

The implementation must consider basic bypass cases.

For example:

1. Participant refreshes the page.
2. Participant closes and reopens the browser.
3. Participant reconnects to the meeting.
4. Participant tries to manipulate frontend JavaScript.
5. Participant directly calls backend APIs.
6. Participant tries to access another participant's analytics.
7. Participant tries to reconnect after the Host ends the meeting.
8. Participant tries to reset their 3 attempts.

The backend must remain the source of truth for important permissions and meeting state.

Do not trust only localStorage, frontend variables, or browser UI state for security-sensitive information.

## 19. Existing Project Preservation

This is an existing project.

Before making changes:

1. Inspect the complete project structure.
2. Understand the existing frontend.
3. Understand the Node.js/Express backend.
4. Understand the MongoDB models.
5. Understand the existing WebRTC implementation.
6. Understand the existing Socket.IO/WebSocket/signaling implementation.
7. Understand the existing Python FastAPI ML service.
8. Understand the existing authentication and user-role system.
9. Understand the existing meeting creation/join flow.
10. Understand the existing summarization system.

Then integrate the new functionality into the existing architecture.

Do NOT delete working features.

Do NOT rewrite the complete project unnecessarily.

Do NOT create duplicate meeting systems.

Reuse existing components, APIs, models, services, and utilities wherever possible.

## 20. Database Requirements

If the existing database models do not support these features, add the minimum required fields/models.

The system may need to store information such as:

Meeting:

* meeting ID
* host ID
* meeting status
* created time
* started time
* ended time
* meeting credentials

Participant:

* participant ID
* meeting ID
* user ID
* role
* camera status
* camera exception permission
* attempt count
* joined time
* left time

Camera permission request:

* meeting ID
* participant ID
* reason
* request status
* created time
* host response time

Use the existing MongoDB structure and naming conventions wherever possible instead of creating unnecessary duplicate collections.

## 21. UI Requirements

The UI should clearly communicate the meeting state.

Participant camera-off warning should be visually clear.

Example:

"Camera is OFF"

"Please turn your camera ON within 30 seconds."

"Attempts remaining: 2"

The Host should have a clear camera permission request panel.

Example:

"Camera Permission Request"

"Participant: John"

"Reason: Camera problem"

[Accept] [Reject]

The Host should also have a clear:

"End Meeting"

button.

The participant should receive a clear meeting-ended message when the Host ends the meeting.

## 22. Important Expected Flow

The final complete flow should work like this:

Host logs in.

Host creates and publishes a meeting.

Host receives meeting credentials.

Host shares credentials with participants.

Participant enters credentials.

System validates credentials.

System checks camera.

If camera is ON:
Participant joins normally.

If camera is OFF:
Participant cannot directly join.
Participant sees the camera requirement message.
Participant can request an exception.

Host receives the request.

Host accepts:
Participant is allowed to join without camera.

Host rejects:
Participant cannot join without camera.

During the meeting:
Normal participants must keep their camera ON.

If camera becomes OFF:
30-second timer starts.

Participant turns camera ON within 30 seconds:
Meeting continues.

Participant repeatedly violates the rule:
Attempts are tracked.

Maximum attempts:
3.

The attempt count must persist and cannot be reset through refresh/reconnect.

During the meeting:
Host can view participant AI analytics.

Participants cannot view Host-only AI analytics.

Host clicks End Meeting:
Meeting ends for everyone.

All participants are disconnected or moved to the meeting-ended state.

Nobody can reconnect to the ended meeting.

Meeting summary is generated/processed.

Participants can access the authorized meeting summary.

Host can access the appropriate meeting information and analytics according to the existing system.

## 23. Final Implementation Goal

The final MeetMind system should behave like a controlled AI meeting platform where:

* The Host controls the meeting.
* Camera access is mandatory by default.
* Participants with valid reasons can request camera permission from the Host.
* The Host decides whether the exception is allowed.
* Participants must normally keep their camera ON.
* Camera-off violations have a 30-second grace period.
* Each participant has only 3 attempts.
* Attempts cannot be reset through refresh/reconnect.
* Host-only AI analytics are protected.
* Participants mainly receive the meeting summary.
* The Host can end the meeting for everyone.
* Once ended, nobody can continue or rejoin the meeting.
* Important permissions and enforcement are handled by the backend.
* Existing MeetMind functionality must remain working.
* Existing WebRTC, Node.js, MongoDB, FastAPI ML, and AI functionality should be reused wherever possible.

Before coding, inspect the existing project and identify the exact files, routes, models, frontend components, WebRTC/signaling code, and ML integration that need to be modified. Then implement the requirements incrementally and test each flow without breaking the existing meeting functionality.
