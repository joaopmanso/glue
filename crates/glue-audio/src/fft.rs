//! src/core/audio/fft.ts: an in-place iterative radix-2 complex FFT, the same twiddles and order of operations.
use crate::js;
use std::f64::consts::PI;

pub struct Fft { n: usize, rev: Vec<u32>, cos: Vec<f64>, sin: Vec<f64> }

impl Fft {
  pub fn new(n: usize) -> Fft {
    let levels = js::round(js::log2(n as f64)) as u32;
    let rev = (0..n as u32).map(|i| { let (mut r, mut x) = (0u32, i); for _ in 0..levels { r = (r << 1) | (x & 1); x >>= 1; } r }).collect();
    let cos = (0..n / 2).map(|i| js::cos(2.0 * PI * i as f64 / n as f64)).collect();
    let sin = (0..n / 2).map(|i| js::sin(2.0 * PI * i as f64 / n as f64)).collect();
    Fft { n, rev, cos, sin }
  }

  pub fn run(&self, re: &mut [f64], im: &mut [f64]) {
    let n = self.n;
    for i in 0..n {
      let j = self.rev[i] as usize;
      if j > i { re.swap(i, j); im.swap(i, j); }
    }
    let mut size = 2;
    while size <= n {
      let (half, step) = (size >> 1, n / size);
      let mut i = 0;
      while i < n {
        let mut k = 0;
        for j in i..i + half {
          let l = j + half;
          let tre = re[l] * self.cos[k] + im[l] * self.sin[k];
          let tim = im[l] * self.cos[k] - re[l] * self.sin[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
          k += step;
        }
        i += size;
      }
      size <<= 1;
    }
  }
}
