/**
 * PLAN2D — "Selbe 2D map 0804" webmap (a4f03c99ab5846c7a3db9b27c2895582)-ээс
 * АВТОМАТААР хуулсан 14 давхаргын ЯГ webmap style (renderer).
 *
 * renderer нь webmap-ийн override (байвал) ЭСВЭЛ service-ийн default. Хоёулаа
 * ArcGIS JSON тул rendererJsonUtils.fromJSON-оор ШУУД тавьдаг — webmap дээрхтэй
 * 100% ижил. Бүгд selbe_3D__0804_WFL1/FeatureServer-ийн sublayer.
 *
 * Эдгээр нь Ерөнхий төлөвлөгөө (2D)-нд каталогийн давхарга болж орно.
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
    "source": "webmap-override",
    "renderer": {
      "type": "simple",
      "symbol": {
        "type": "esriPMS",
        "angle": 0,
        "xoffset": 0,
        "yoffset": 0,
        "contentType": "image/png",
        "imageData": "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",
        "url": "https://static.arcgis.com/images/Symbols/Firefly/FireflyB14.png",
        "height": 5,
        "width": 5.003
      }
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
/** id-гаар webmap renderer-ийг олох (buildLayers-д fromJSON-д өгнө) */
export const plan2dStyleOf = (id: string): unknown => BY_ID[id]?.renderer;
