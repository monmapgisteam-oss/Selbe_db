/**
 * PLAN2D — "Selbe 2D map 0804" webmap-ээс хуулсан 14 давхаргын style.
 * renderer нь webmap override / service default (rendererJsonUtils.fromJSON).
 *
 * ⚠️ Мод (sb:0) — дээрээс харсан БОДИТ 2 модны зураг (public/tree-oak.webp,
 *    tree-dense.png)-ыг OBJECTID-аар RANDOM ононо. Size visual variable (метр)
 *    тул zoom-оор масштаблана (холоос жижгэрч, ойроос томорно).
 */
export type Plan2DLayer = {
  id: string;
  sub: number;
  title: string;
  geom: "point" | "line" | "area";
  opacity: number;
  source: string;
  renderer: unknown;
};

export const PLAN2D_LAYERS: Plan2DLayer[] = [
  {
    "id": "sb:0",
    "sub": 0,
    "title": "Мод",
    "geom": "point",
    "opacity": 1,
    "source": "real-photos x2 random + meter-scale (oak/dense)",
    "renderer": {
      "type": "uniqueValue",
      "valueExpression": "When($feature.OBJECTID % 2 == 0, 'oak', 'dense')",
      "valueExpressionTitle": "Модны төрөл",
      "defaultSymbol": {
        "type": "esriPMS",
        "url": "/tree-oak.webp",
        "contentType": "image/webp",
        "width": 52,
        "height": 29,
        "angle": 0,
        "xoffset": 0,
        "yoffset": 0
      },
      "uniqueValueInfos": [
        {
          "value": "oak",
          "label": "Царс (оук)",
          "symbol": {
            "type": "esriPMS",
            "url": "/tree-oak.webp",
            "contentType": "image/webp",
            "width": 52,
            "height": 29,
            "angle": 0,
            "xoffset": 0,
            "yoffset": 0
          }
        },
        {
          "value": "dense",
          "label": "Нягт навчит",
          "symbol": {
            "type": "esriPMS",
            "url": "/tree-dense.png",
            "contentType": "image/png",
            "width": 34,
            "height": 34,
            "angle": 0,
            "xoffset": 0,
            "yoffset": 0
          }
        }
      ],
      "visualVariables": [
        {
          "type": "sizeInfo",
          "valueExpression": "8",
          "valueUnit": "meters",
          "minSize": 3,
          "maxSize": 44
        }
      ]
    }
  },
  {
    "id": "sb:1",
    "sub": 1,
    "title": "Ногоон байгууламж",
    "geom": "area",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "style": "esriSFSSolid",
        "color": [
          205,
          205,
          102,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "style": "esriSLSSolid",
          "color": [
            0,
            0,
            0,
            255
          ],
          "width": 0.4
        }
      }
    }
  },
  {
    "id": "sb:2",
    "sub": 2,
    "title": "Автозам",
    "geom": "area",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "style": "esriSFSSolid",
        "color": [
          178,
          178,
          178,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "style": "esriSLSSolid",
          "color": [
            255,
            255,
            255,
            255
          ],
          "width": 0.75
        }
      }
    }
  },
  {
    "id": "sb:3",
    "sub": 3,
    "title": "Явган зам",
    "geom": "area",
    "opacity": 1,
    "source": "webmap-override",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "CIMSymbolReference",
        "symbol": {
          "type": "CIMPolygonSymbol",
          "symbolLayers": [
            {
              "type": "CIMHatchFill",
              "enable": true,
              "lineSymbol": {
                "type": "CIMLineSymbol",
                "symbolLayers": [
                  {
                    "type": "CIMSolidStroke",
                    "enable": true,
                    "capStyle": "Round",
                    "joinStyle": "Round",
                    "lineStyle3D": "Strip",
                    "miterLimit": 10,
                    "width": 1,
                    "color": [
                      156,
                      156,
                      156,
                      255
                    ]
                  }
                ]
              },
              "rotation": 135,
              "separation": 4
            },
            {
              "type": "CIMHatchFill",
              "enable": true,
              "lineSymbol": {
                "type": "CIMLineSymbol",
                "symbolLayers": [
                  {
                    "type": "CIMSolidStroke",
                    "enable": true,
                    "capStyle": "Round",
                    "joinStyle": "Round",
                    "lineStyle3D": "Strip",
                    "miterLimit": 10,
                    "width": 1,
                    "color": [
                      156,
                      156,
                      156,
                      255
                    ]
                  }
                ]
              },
              "rotation": 45,
              "separation": 4
            }
          ]
        }
      }
    }
  },
  {
    "id": "sb:4",
    "sub": 4,
    "title": "Барилга",
    "geom": "area",
    "opacity": 1,
    "source": "webmap-override",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          230,
          172,
          57,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            0,
            0,
            0,
            255
          ],
          "width": 0.375,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    }
  },
  {
    "id": "sb:5",
    "sub": 5,
    "title": "Замын цагаан зураас",
    "geom": "line",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "uniqueValue",
      "field1": "color",
      "defaultSymbol": {
        "type": "esriSLS",
        "style": "esriSLSSolid",
        "color": [
          130,
          130,
          130,
          255
        ],
        "width": 1
      },
      "defaultLabel": "<all other values>",
      "uniqueValueGroups": [
        {
          "heading": "color",
          "classes": [
            {
              "label": "6",
              "description": "6",
              "symbol": {
                "type": "esriSLS",
                "style": "esriSLSDash",
                "color": [
                  255,
                  255,
                  255,
                  255
                ],
                "width": 1.5
              },
              "values": [
                [
                  "6"
                ]
              ]
            },
            {
              "label": "7",
              "description": "7",
              "symbol": {
                "type": "esriSLS",
                "style": "esriSLSSolid",
                "color": [
                  255,
                  255,
                  255,
                  255
                ],
                "width": 2
              },
              "values": [
                [
                  "7"
                ]
              ]
            }
          ]
        }
      ],
      "uniqueValueInfos": [
        {
          "symbol": {
            "type": "esriSLS",
            "style": "esriSLSDash",
            "color": [
              255,
              255,
              255,
              255
            ],
            "width": 1.5
          },
          "value": "6",
          "label": "6"
        },
        {
          "symbol": {
            "type": "esriSLS",
            "style": "esriSLSSolid",
            "color": [
              255,
              255,
              255,
              255
            ],
            "width": 2
          },
          "value": "7",
          "label": "7"
        }
      ],
      "fieldDelimiter": ",",
      "authoringInfo": {
        "colorRamp": {
          "type": "multipart",
          "colorRamps": [
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                202,
                220,
                252,
                255
              ],
              "toColor": [
                202,
                220,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                230,
                252,
                179,
                255
              ],
              "toColor": [
                230,
                252,
                179,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                182,
                190,
                255
              ],
              "toColor": [
                252,
                182,
                190,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                249,
                182,
                252,
                255
              ],
              "toColor": [
                249,
                182,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                187,
                252,
                238,
                255
              ],
              "toColor": [
                187,
                252,
                238,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                234,
                210,
                255
              ],
              "toColor": [
                252,
                234,
                210,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                215,
                241,
                255
              ],
              "toColor": [
                252,
                215,
                241,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                184,
                252,
                206,
                255
              ],
              "toColor": [
                184,
                252,
                206,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                207,
                192,
                252,
                255
              ],
              "toColor": [
                207,
                192,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                206,
                192,
                255
              ],
              "toColor": [
                252,
                206,
                192,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                246,
                187,
                255
              ],
              "toColor": [
                252,
                246,
                187,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                179,
                235,
                252,
                255
              ],
              "toColor": [
                179,
                235,
                252,
                255
              ]
            },
            {
              "type": "algorithmic",
              "algorithm": "esriCIELabAlgorithm",
              "fromColor": [
                252,
                187,
                220,
                255
              ],
              "toColor": [
                252,
                187,
                220,
                255
              ]
            }
          ]
        }
      }
    }
  },
  {
    "id": "sb:7",
    "sub": 7,
    "title": "Sport area line",
    "geom": "line",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSLS",
        "style": "esriSLSSolid",
        "color": [
          191,
          191,
          153,
          255
        ],
        "width": 3.5
      }
    }
  },
  {
    "id": "sb:8",
    "sub": 8,
    "title": "Спорт талбай",
    "geom": "area",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "style": "esriSFSSolid",
        "color": [
          31,
          132,
          36,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "style": "esriSLSSolid",
          "color": [
            110,
            110,
            110,
            255
          ],
          "width": 0.7
        }
      }
    }
  },
  {
    "id": "sb:10",
    "sub": 10,
    "title": "Huuhdiin togloom line",
    "geom": "line",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSLS",
        "style": "esriSLSSolid",
        "color": [
          189,
          208,
          252,
          255
        ],
        "width": 1
      }
    }
  },
  {
    "id": "sb:11",
    "sub": 11,
    "title": "Huuhdiin togloom polygon",
    "geom": "area",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "style": "esriSFSSolid",
        "color": [
          107,
          170,
          39,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "style": "esriSLSSolid",
          "color": [
            110,
            110,
            110,
            255
          ],
          "width": 0.7
        }
      }
    }
  },
  {
    "id": "sb:13",
    "sub": 13,
    "title": "Suudrevch line",
    "geom": "line",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSLS",
        "style": "esriSLSSolid",
        "color": [
          255,
          255,
          255,
          255
        ],
        "width": 0.4
      }
    }
  },
  {
    "id": "sb:14",
    "sub": 14,
    "title": "Suudrevch polygon",
    "geom": "area",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "style": "esriSFSSolid",
        "color": [
          132,
          0,
          168,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "style": "esriSLSSolid",
          "color": [
            255,
            255,
            255,
            255
          ],
          "width": 0.4
        }
      }
    }
  },
  {
    "id": "sb:15",
    "sub": 15,
    "title": "Дугуйн зам",
    "geom": "area",
    "opacity": 1,
    "source": "service-default",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "style": "esriSFSSolid",
        "color": [
          255,
          167,
          127,
          255
        ],
        "outline": {
          "type": "esriSLS",
          "style": "esriSLSSolid",
          "color": [
            0,
            0,
            0,
            255
          ],
          "width": 0.7
        }
      }
    }
  },
  {
    "id": "sb:16",
    "sub": 16,
    "title": "Гол",
    "geom": "area",
    "opacity": 1,
    "source": "webmap-override",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriSFS",
        "color": [
          58,
          204,
          252,
          178
        ],
        "outline": {
          "type": "esriSLS",
          "color": [
            71,
            145,
            255,
            255
          ],
          "width": 0.75,
          "style": "esriSLSSolid"
        },
        "style": "esriSFSSolid"
      }
    }
  }
];

const BY_ID: Record<string, Plan2DLayer> = Object.fromEntries(PLAN2D_LAYERS.map((l) => [l.id, l]));
export const plan2dStyleOf = (id: string): unknown => BY_ID[id]?.renderer;
