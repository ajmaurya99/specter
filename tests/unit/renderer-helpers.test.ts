import { describe, expect, it } from "vitest";
import { jpegDimensions } from "@/lib/engine/renderer";

/** Minimal JPEG: SOI, APP0 stub, SOF0 with given dims. */
function fakeJpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4
    0xff, 0xc0, 0x00, 0x0b, 0x08, // SOF0, length 11, precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, // components stub
  ]);
}

describe("jpegDimensions", () => {
  it("reads the SOF dimensions", () => {
    expect(jpegDimensions(fakeJpeg(1280, 7924))).toEqual({ width: 1280, height: 7924 });
    expect(jpegDimensions(fakeJpeg(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("returns null for non-JPEG bytes", () => {
    expect(jpegDimensions(Buffer.from("not a jpeg"))).toBeNull();
    expect(jpegDimensions(Buffer.from([]))).toBeNull();
  });
});
