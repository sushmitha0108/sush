// =============================================
// controllers/eventController.js
// =============================================
// Handles all event CRUD operations:
// - Get all events
// - Get single event by ID
// - Add new event (admin only)
// - Edit event (admin only)
// - Delete event (admin only)

const { db } = require("../firebase");
const { createEventModel, buildEventUpdate } = require("../models/eventModel");

// =============================================
// GET /api/events
// Fetch all active events (public route)
// =============================================
const getAllEvents = async (req, res) => {
  try {
    // Optional query params for filtering
    const { category, date } = req.query;

    let query = db.collection("events").where("isActive", "==", true);

    // Apply filters if provided
    if (category) {
      query = query.where("category", "==", category);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No events found.",
        events: [],
      });
    }

    // Map Firestore documents to plain objects with IDs
    const events = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("❌ Get All Events Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch events.",
    });
  }
};

// =============================================
// GET /api/events/:id
// Fetch a single event by its Firestore document ID
// =============================================
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const eventDoc = await db.collection("events").doc(id).get();

    if (!eventDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    return res.status(200).json({
      success: true,
      event: { id: eventDoc.id, ...eventDoc.data() },
    });
  } catch (error) {
    console.error("❌ Get Event By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch event.",
    });
  }
};

// =============================================
// POST /api/events
// Add a new event (Admin only)
// =============================================
const addEvent = async (req, res) => {
  try {
    // req.user is set by verifyToken middleware (contains admin ID)
    const createdBy = req.user.id;

    // Build event using model
    const eventData = createEventModel(req.body, createdBy);

    // Save to Firestore
    const docRef = await db.collection("events").add(eventData);

    return res.status(201).json({
      success: true,
      message: "Event added successfully! 🎉",
      event: { id: docRef.id, ...eventData },
    });
  } catch (error) {
    console.error("❌ Add Event Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add event.",
    });
  }
};

// =============================================
// PUT /api/events/:id
// Edit an existing event (Admin only)
// =============================================
const editEvent = async (req, res) => {
  try {
    const { id } = req.params;

    // Check event exists
    const eventRef = db.collection("events").doc(id);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // Build only the updated fields
    const updates = buildEventUpdate(req.body);

    // Handle seat count update carefully
    // If totalSeats changed, adjust availableSeats accordingly
    if (req.body.totalSeats !== undefined) {
      const currentData = eventDoc.data();
      const seatsUsed = currentData.totalSeats - currentData.availableSeats;
      const newTotal = parseInt(req.body.totalSeats);

      if (newTotal < seatsUsed) {
        return res.status(400).json({
          success: false,
          message: `Cannot set seats to ${newTotal}. ${seatsUsed} students already registered.`,
        });
      }

      updates.availableSeats = newTotal - seatsUsed;
    }

    await eventRef.update(updates);

    return res.status(200).json({
      success: true,
      message: "Event updated successfully! ✅",
      event: { id, ...updates },
    });
  } catch (error) {
    console.error("❌ Edit Event Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update event.",
    });
  }
};

// =============================================
// DELETE /api/events/:id
// Delete an event (Admin only)
// Also cancels all registrations for this event
// =============================================
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const eventRef = db.collection("events").doc(id);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // Use Firestore batch to:
    // 1. Delete the event
    // 2. Cancel all registrations for this event
    const batch = db.batch();

    // Mark registrations as cancelled instead of deleting (audit trail)
    const registrationsSnapshot = await db
      .collection("registrations")
      .where("eventId", "==", id)
      .get();

    registrationsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        registrationStatus: "cancelled",
        updatedAt: new Date().toISOString(),
      });
    });

    // Delete the event document
    batch.delete(eventRef);

    await batch.commit();

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully. Related registrations have been cancelled.",
      cancelledRegistrations: registrationsSnapshot.size,
    });
  } catch (error) {
    console.error("❌ Delete Event Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete event.",
    });
  }
};

module.exports = { getAllEvents, getEventById, addEvent, editEvent, deleteEvent };
