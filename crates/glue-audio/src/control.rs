//! How long a song's analysis may take (GLUE Home's `timeFor`, ADR 0144): past its deadline, the next check fails with
//! the message the website's pool gives a worker it stops ("took too long", a passing failure, tried again later).
use std::cell::Cell;
use std::time::Instant;

thread_local! { static DEADLINE: Cell<Option<Instant>> = const { Cell::new(None) }; }

pub const TOO_LONG: &str = "The analysis took too long.";

/// The deadline for what this thread analyses next (None: no limit).
pub fn set_deadline(at: Option<Instant>) { DEADLINE.with(|d| d.set(at)); }

/// Err once the deadline has passed.
pub fn check() -> Result<(), String> {
  match DEADLINE.with(|d| d.get()) { Some(at) if Instant::now() >= at => Err(TOO_LONG.into()), _ => Ok(()) }
}
