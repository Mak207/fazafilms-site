// Camera profiles checked against the decoded pavilion mesh.
export const VISITOR_CAMERA_PROFILES = {
  "west": {
    "height": 2.6,
    "fov": 58,
    "keys": [
      {
        "distance": 0,
        "lag": 3.5
      }
    ]
  },
  "east": {
    "height": 2.6,
    "fov": 58,
    "keys": [
      {
        "distance": 0,
        "lag": 3.5
      },
      {
        "distance": 36.78601811284865,
        "lag": 3.5
      },
      {
        "distance": 36.98594212433152,
        "lag": 3.4599772034448617
      },
      {
        "distance": 37.18586613581439,
        "lag": 3.4
      },
      {
        "distance": 37.78563817026301,
        "lag": 3.4
      },
      {
        "distance": 37.985562181745884,
        "lag": 3.4599772034448617
      },
      {
        "distance": 38.18548619322876,
        "lag": 3.5
      },
      {
        "distance": 66.57469582379674,
        "lag": 3.5
      },
      {
        "distance": 66.77461983527961,
        "lag": 3.4599772034448617
      },
      {
        "distance": 66.97454384676249,
        "lag": 3.4
      },
      {
        "distance": 67.5743158812111,
        "lag": 3.4
      },
      {
        "distance": 67.77423989269397,
        "lag": 3.4599772034448617
      },
      {
        "distance": 67.97416390417685,
        "lag": 3.5
      },
      {
        "distance": 139.94680803801117,
        "lag": 3.5
      }
    ]
  },
  "northwest": {
    "height": 2.6,
    "fov": 58,
    "keys": [
      {
        "distance": 0,
        "lag": 3.2395831406849775
      },
      {
        "distance": 0.7986104689499287,
        "lag": 3.4791662813699555
      },
      {
        "distance": 0.8984367775686698,
        "lag": 3.5
      },
      {
        "distance": 5.789925899886983,
        "lag": 3.5
      },
      {
        "distance": 5.889752208505724,
        "lag": 3.4791662813699555
      },
      {
        "distance": 7.486973146405582,
        "lag": 2.9999999999999996
      },
      {
        "distance": 7.586799455024323,
        "lag": 2.989843677756866
      },
      {
        "distance": 7.886278380880546,
        "lag": 2.8999999999999995
      },
      {
        "distance": 8.18575730673677,
        "lag": 2.8999999999999995
      },
      {
        "distance": 8.28558361535551,
        "lag": 2.889843677756866
      },
      {
        "distance": 8.585062541211734,
        "lag": 2.7999999999999994
      },
      {
        "distance": 8.684888849830475,
        "lag": 2.7999999999999994
      },
      {
        "distance": 8.984367775686698,
        "lag": 2.889843677756866
      },
      {
        "distance": 9.08419408430544,
        "lag": 2.8999999999999995
      },
      {
        "distance": 9.483499318780403,
        "lag": 2.8999999999999995
      },
      {
        "distance": 9.782978244636627,
        "lag": 2.989843677756866
      },
      {
        "distance": 9.882804553255367,
        "lag": 2.9999999999999996
      },
      {
        "distance": 10.581588713586555,
        "lag": 3.2096352480993553
      }
    ]
  },
  "northeast": {
    "height": 2.6,
    "fov": 58,
    "keys": [
      {
        "distance": 0,
        "lag": 3.5
      }
    ]
  }
};

// Follow the visitor on the same verified route. Interpolate the camera's
// following distance, never a straight line across a wall or doorway.
export function lagAtDistance(distance, length, keys) {
  const d = ((distance % length) + length) % length;
  let lo = 0, hi = keys.length;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid].distance <= d) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[(lo + 1) % keys.length];
  const end = lo + 1 < keys.length ? b.distance : b.distance + length;
  const t = (d - a.distance) / (end - a.distance || 1);
  return a.lag + (b.lag - a.lag) * t;
}

export function focusViewAtDistance(distance, route, camera) {
  // pointAtDistance accepts wrapping arc-distance in metres, XZ gait metric.
  // It returns {x, y, z}; y is the local walking floor.
  const lag = lagAtDistance(distance, route.length, camera.keys);
  const actor = route.pointAtDistance(distance);
  const eye = route.pointAtDistance(distance - lag);
  return {
    position: [eye.x, eye.y + camera.height, eye.z],
    target: [actor.x, actor.y + 1, actor.z],
    fov: camera.fov,
  };
}
