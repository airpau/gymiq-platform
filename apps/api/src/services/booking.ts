import { prisma } from '../lib/prisma';
import { leadPipeline } from './lead-pipeline';

export type BookingType = 'tour' | 'trial_class' | 'consultation';
export type BookingStatus = 'scheduled' | 'confirmed' | 'attended' | 'no_show' | 'cancelled';

interface TimeSlot {
  time: string; // Format: "09:00" or "14:30"
  available: boolean;
  duration: number; // minutes
}

interface DaySchedule {
  date: string; // Format: "2024-03-15"
  dayOfWeek: string;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  slots: TimeSlot[];
}

interface BookingData {
  leadId: string;
  gymId: string;
  date: Date;
  timeSlot: string;
  type: BookingType;
  notes?: string;
  metadata?: Record<string, any>;
}

interface OpeningHours {
  monday?: string;    // Format: "06:00-22:00" or "closed"
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}

export class BookingService {
  /**
   * Default opening hours if not configured in gym settings
   */
  private static readonly DEFAULT_OPENING_HOURS: OpeningHours = {
    monday: '06:00-22:00',
    tuesday: '06:00-22:00',
    wednesday: '06:00-22:00',
    thursday: '06:00-22:00',
    friday: '06:00-22:00',
    saturday: '08:00-20:00',
    sunday: '08:00-20:00',
  };

  /**
   * Booking slot durations by type (minutes)
   */
  private static readonly BOOKING_DURATIONS: Record<BookingType, number> = {
    tour: 30,           // 30-minute gym tour
    trial_class: 60,    // 1-hour trial class
    consultation: 45,   // 45-minute consultation
  };

  /**
   * Get available booking slots for a date range
   */
  async getAvailableSlots(
    gymId: string,
    startDate: Date,
    endDate: Date,
    bookingType: BookingType = 'tour'
  ): Promise<DaySchedule[]> {
    try {
      // Get gym with opening hours
      const gym = await prisma.gym.findUnique({
        where: { id: gymId },
        select: { settings: true, name: true }
      });

      if (!gym) {
        throw new Error('Gym not found');
      }

      const settings = (gym.settings as any) || {};
      const openingHours = settings.openingHours || BookingService.DEFAULT_OPENING_HOURS;

      // Generate schedule for date range
      const schedule: DaySchedule[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const daySchedule = await this.generateDaySchedule(
          gymId,
          new Date(currentDate),
          openingHours,
          bookingType
        );
        schedule.push(daySchedule);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return schedule;
    } catch (error) {
      console.error(`[Booking] Error getting available slots for gym ${gymId}:`, error);
      return [];
    }
  }

  /**
   * Book a visit for a lead
   */
  async bookVisit(bookingData: BookingData): Promise<{ success: boolean; bookingId?: string; error?: string }> {
    try {
      // Validate lead exists
      const lead = await prisma.lead.findUnique({
        where: { id: bookingData.leadId },
        select: { id: true, name: true, phone: true, email: true }
      });

      if (!lead) {
        return { success: false, error: 'Lead not found' };
      }

      // Check if slot is still available
      const isAvailable = await this.isSlotAvailable(
        bookingData.gymId,
        bookingData.date,
        bookingData.timeSlot,
        bookingData.type
      );

      if (!isAvailable) {
        return { success: false, error: 'Time slot is no longer available' };
      }

      // Create booking
      const booking = await prisma.booking.create({
        data: {
          gymId: bookingData.gymId,
          leadId: bookingData.leadId,
          date: bookingData.date,
          timeSlot: bookingData.timeSlot,
          type: bookingData.type,
          status: 'scheduled',
          notes: bookingData.notes,
          metadata: {
            ...bookingData.metadata,
            bookedAt: new Date().toISOString(),
            duration: BookingService.BOOKING_DURATIONS[bookingData.type],
          },
        },
      });

      // Update lead stage to 'booked'
      await leadPipeline.markBooked(bookingData.leadId, 'system');

      console.log(`[Booking] Created booking ${booking.id} for lead ${bookingData.leadId} on ${bookingData.date.toISOString().split('T')[0]} at ${bookingData.timeSlot}`);

      return { success: true, bookingId: booking.id };
    } catch (error) {
      console.error('[Booking] Error creating booking:', error);
      return { success: false, error: 'Failed to create booking' };
    }
  }

  /**
   * Confirm a booking (lead confirms they will attend)
   */
  async confirmBooking(bookingId: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // First get the existing booking
      const existingBooking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { notes: true }
      });

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'confirmed',
          confirmedAt: new Date(),
          notes: notes ? `${notes}${existingBooking?.notes ? `\n\nPrevious: ${existingBooking.notes}` : ''}` : undefined,
        },
        include: { lead: true }
      });

      console.log(`[Booking] Confirmed booking ${bookingId} for lead ${booking.leadId}`);
      return { success: true };
    } catch (error) {
      console.error(`[Booking] Error confirming booking ${bookingId}:`, error);
      return { success: false, error: 'Failed to confirm booking' };
    }
  }

  /**
   * Mark a booking as attended
   */
  async markAttended(bookingId: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // First get the existing booking
      const existingBooking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { notes: true }
      });

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'attended',
          attendedAt: new Date(),
          notes: notes ? `${notes}${existingBooking?.notes ? `\n\nPrevious: ${existingBooking.notes}` : ''}` : undefined,
        },
        include: { lead: true }
      });

      // Advance lead to 'visited' stage
      if (booking.lead) {
        await leadPipeline.markVisited(booking.leadId);
      }

      console.log(`[Booking] Marked booking ${bookingId} as attended for lead ${booking.leadId}`);
      return { success: true };
    } catch (error) {
      console.error(`[Booking] Error marking booking ${bookingId} as attended:`, error);
      return { success: false, error: 'Failed to mark as attended' };
    }
  }

  /**
   * Mark a booking as no-show
   */
  async markNoShow(bookingId: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // First get the existing booking
      const existingBooking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { notes: true }
      });

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'no_show',
          notes: notes ? `No-show: ${notes}${existingBooking?.notes ? `\n\nPrevious: ${existingBooking.notes}` : ''}` : 'No-show',
        },
        include: { lead: true }
      });

      // Create follow-up journey entry
      await prisma.leadJourney.create({
        data: {
          leadId: booking.leadId,
          stage: booking.lead?.currentStage || 'booked',
          fromStage: booking.lead?.currentStage || 'booked',
          channel: 'system',
          action: 'follow_up',
          message: `No-show for ${booking.type} on ${booking.date.toISOString().split('T')[0]} at ${booking.timeSlot}`,
          metadata: { bookingId, noShow: true },
        },
      });

      console.log(`[Booking] Marked booking ${bookingId} as no-show for lead ${booking.leadId}`);
      return { success: true };
    } catch (error) {
      console.error(`[Booking] Error marking booking ${bookingId} as no-show:`, error);
      return { success: false, error: 'Failed to mark as no-show' };
    }
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(bookingId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // First get the existing booking
      const existingBooking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { notes: true, leadId: true }
      });

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'cancelled',
          notes: reason ? `Cancelled: ${reason}${existingBooking?.notes ? `\n\nPrevious: ${existingBooking.notes}` : ''}` : 'Cancelled',
        },
      });

      console.log(`[Booking] Cancelled booking ${bookingId} for lead ${booking.leadId}: ${reason || 'No reason given'}`);
      return { success: true };
    } catch (error) {
      console.error(`[Booking] Error cancelling booking ${bookingId}:`, error);
      return { success: false, error: 'Failed to cancel booking' };
    }
  }

  /**
   * Get bookings for a gym on a specific date
   */
  async getBookingsForDate(gymId: string, date: Date): Promise<any[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const bookings = await prisma.booking.findMany({
        where: {
          gymId,
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: { not: 'cancelled' },
        },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              currentStage: true,
            },
          },
        },
        orderBy: { timeSlot: 'asc' },
      });

      return bookings;
    } catch (error) {
      console.error(`[Booking] Error getting bookings for ${gymId} on ${date.toISOString().split('T')[0]}:`, error);
      return [];
    }
  }

  /**
   * Get upcoming bookings for a lead
   */
  async getLeadBookings(leadId: string): Promise<any[]> {
    try {
      const bookings = await prisma.booking.findMany({
        where: {
          leadId,
          date: { gte: new Date() }, // Upcoming only
        },
        orderBy: { date: 'asc' },
      });

      return bookings;
    } catch (error) {
      console.error(`[Booking] Error getting bookings for lead ${leadId}:`, error);
      return [];
    }
  }

  /**
   * Send booking reminders (to be called by worker)
   */
  async sendBookingReminders(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      // Get bookings for tomorrow that haven't been reminded yet
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);

      const bookingsToRemind = await prisma.booking.findMany({
        where: {
          date: {
            gte: tomorrow,
            lte: endOfTomorrow,
          },
          status: { in: ['scheduled', 'confirmed'] },
          remindedAt: null,
        },
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          gym: { select: { name: true } },
        },
      });

      for (const booking of bookingsToRemind) {
        try {
          // TODO: Integrate with messaging service to send reminder
          console.log(`[Booking] Would send reminder for booking ${booking.id} to ${booking.lead?.name || 'lead'}`);

          // Mark as reminded
          await prisma.booking.update({
            where: { id: booking.id },
            data: { remindedAt: new Date() },
          });

          processed++;
        } catch (error) {
          console.error(`[Booking] Error sending reminder for booking ${booking.id}:`, error);
          errors++;
        }
      }

      console.log(`[Booking] Processed ${processed} booking reminders with ${errors} errors`);
      return { processed, errors };
    } catch (error) {
      console.error('[Booking] Error in reminder process:', error);
      return { processed, errors: errors + 1 };
    }
  }

  /**
   * Generate day schedule with available slots
   */
  private async generateDaySchedule(
    gymId: string,
    date: Date,
    openingHours: OpeningHours,
    bookingType: BookingType
  ): Promise<DaySchedule> {
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as keyof OpeningHours;
    const dateStr = date.toISOString().split('T')[0];
    const dayHours = openingHours[dayOfWeek];

    if (!dayHours || dayHours === 'closed') {
      return {
        date: dateStr,
        dayOfWeek,
        isOpen: false,
        slots: [],
      };
    }

    const [openTime, closeTime] = dayHours.split('-');
    const duration = BookingService.BOOKING_DURATIONS[bookingType];

    // Generate time slots
    const slots: TimeSlot[] = [];
    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);

    let currentTime = openHour * 60 + openMin; // Convert to minutes
    const endTime = closeHour * 60 + closeMin - duration; // Leave buffer for booking duration

    while (currentTime <= endTime) {
      const hour = Math.floor(currentTime / 60);
      const minute = currentTime % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      const isAvailable = await this.isSlotAvailable(gymId, date, timeStr, bookingType);

      slots.push({
        time: timeStr,
        available: isAvailable,
        duration,
      });

      currentTime += 30; // 30-minute intervals
    }

    return {
      date: dateStr,
      dayOfWeek,
      isOpen: true,
      openTime,
      closeTime,
      slots,
    };
  }

  /**
   * Check if a time slot is available
   */
  private async isSlotAvailable(
    gymId: string,
    date: Date,
    timeSlot: string,
    bookingType: BookingType
  ): Promise<boolean> {
    try {
      // Don't allow bookings in the past
      const now = new Date();
      const bookingDateTime = new Date(`${date.toISOString().split('T')[0]}T${timeSlot}:00`);
      if (bookingDateTime <= now) {
        return false;
      }

      // Check for existing bookings at this time
      const existingBooking = await prisma.booking.findFirst({
        where: {
          gymId,
          date,
          timeSlot,
          status: { not: 'cancelled' },
        },
      });

      // For simplicity, assume max 1 booking per slot for now
      // In production, you might have capacity limits per booking type
      return !existingBooking;
    } catch (error) {
      console.error(`[Booking] Error checking slot availability:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const bookingService = new BookingService();