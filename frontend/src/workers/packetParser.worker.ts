/// <reference lib="webworker" />
export {};

self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  const bytes = new Uint8Array(e.data.buffer);
  const view = new DataView(bytes.buffer);

  const cc = view.getUint8(0);
  const apidSeq = view.getUint16(1);
  const seq = view.getUint16(3);
  const length = view.getUint16(5);

  const apid = apidSeq & 0x7ff;
  const payload = bytes.slice(7, 7 + length + 1);

  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const floats: number[] = [];
  for (let i = 0; i + 4 <= payload.byteLength; i += 4) {
    floats.push(dv.getFloat32(i));
  }

  (self as unknown as Worker).postMessage({
    cc,
    apid,
    seq: seq & 0x3fff,
    length,
    floats,
    payloadHex: Array.from(payload)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  });
};