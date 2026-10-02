//! src/workers/cover.ts (ADR 0072): a song's front cover from its tags, as small square JPEGs (64 px for the table,
//! 320 px to look at), named by the picture's hash so an album's songs share one. The hash is the website's (sha256 of
//! the picture's bytes); the JPEGs are made here, not byte-identical to the browser's, and needn't be.
use image::{imageops::FilterType, DynamicImage, ImageDecoder, ImageReader};
use lofty::picture::PictureType;
use lofty::prelude::*;
use sha2::{Digest, Sha256};
use std::io::Cursor;

pub struct Cover { pub hash: String, pub small: Vec<u8>, pub large: Vec<u8> }
pub const SMALL: u32 = 64;
pub const LARGE: u32 = 320;

/// The picture `coverOf` picks: the front cover, else any but the back, else the first; at least 64 bytes.
pub fn picture(bytes: &[u8]) -> Option<Vec<u8>> {
  let file = lofty::probe::Probe::new(Cursor::new(bytes)).guess_file_type().ok()?.options(lofty::config::ParseOptions::new().read_properties(false)).read().ok()?;
  let mut pics: Vec<(PictureType, Vec<u8>)> = Vec::new();
  for tag in file.tags() { for p in tag.pictures() { pics.push((p.pic_type(), p.data().to_vec())); } }
  let pick = pics.iter().position(|p| p.0 == PictureType::CoverFront).or_else(|| pics.iter().position(|p| p.0 != PictureType::CoverBack)).or(if pics.is_empty() { None } else { Some(0) })?;
  let data = pics.swap_remove(pick).1;
  if data.len() < 64 { None } else { Some(data) }
}

/// `coverFromImage`: square from the middle, the small one made from the large one.
pub fn from_image(data: &[u8]) -> Result<Cover, String> {
  let hash: String = Sha256::digest(data).iter().map(|b| format!("{b:02x}")).collect::<String>()[..24].to_string();
  let mut dec = ImageReader::new(Cursor::new(data)).with_guessed_format().map_err(|e| e.to_string())?.into_decoder().map_err(|e| e.to_string())?;
  let orient = dec.orientation().ok();
  let mut img = DynamicImage::from_decoder(dec).map_err(|e| e.to_string())?;
  if let Some(o) = orient { img.apply_orientation(o); }
  let large = square(&img, LARGE);
  let small = square(&large, SMALL);
  Ok(Cover { hash, small: jpeg(&small)?, large: jpeg(&large)? })
}

fn square(src: &DynamicImage, size: u32) -> DynamicImage {
  let s = src.width().min(src.height());
  let crop = src.crop_imm((src.width() - s) / 2, (src.height() - s) / 2, s, s);
  crop.resize_exact(size, size, FilterType::Lanczos3)
}

fn jpeg(img: &DynamicImage) -> Result<Vec<u8>, String> {
  let mut out = Vec::new();
  let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 86);
  enc.encode_image(&img.to_rgb8()).map_err(|e| e.to_string())?;
  Ok(out)
}

/// The song's cover, or None when it has none.
pub fn cover_of(bytes: &[u8]) -> Option<Cover> { picture(bytes).and_then(|p| from_image(&p).ok()) }
