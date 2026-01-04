/**
 * US Counties Seed Data
 *
 * Contains all 3100 US counties/county-equivalents with FIPS codes from US Census Bureau.
 * Reference: https://transition.fcc.gov/oet/info/maps/census/fips/fips.txt
 *
 * FIPS Code Format: 5 digits = State (2) + County (3)
 * Example: Fulton County, GA = 13121 (13 + 121)
 *
 * County equivalents include:
 * - Louisiana: Parishes
 * - Alaska: Boroughs and Census Areas
 * - Virginia: Independent cities
 *
 * @generated Automatically generated from US Census Bureau FIPS data
 * @enterprise-standards
 * - DB-006: Geographic reference data for tenant scoping
 * - SEC-006: Static data, no SQL injection risk
 */

export interface CountyData {
  name: string;
  fips_code: string;
  county_seat?: string;
  population?: number;
}

/**
 * Counties indexed by state code
 * Total: 3100 counties across 51 states/territories
 */
export const usCountiesByState: Record<string, CountyData[]> = {
  DE: [
    {
      name: "Kent",
      fips_code: "10001",
    },
    {
      name: "New Castle",
      fips_code: "10003",
    },
    {
      name: "Sussex",
      fips_code: "10005",
    },
  ],
  DC: [
    {
      name: "District of Columbia",
      fips_code: "11001",
    },
  ],
  FL: [
    {
      name: "Alachua",
      fips_code: "12001",
    },
    {
      name: "Baker",
      fips_code: "12003",
    },
    {
      name: "Bay",
      fips_code: "12005",
    },
    {
      name: "Bradford",
      fips_code: "12007",
    },
    {
      name: "Brevard",
      fips_code: "12009",
    },
    {
      name: "Broward",
      fips_code: "12011",
    },
    {
      name: "Calhoun",
      fips_code: "12013",
    },
    {
      name: "Charlotte",
      fips_code: "12015",
    },
    {
      name: "Citrus",
      fips_code: "12017",
    },
    {
      name: "Clay",
      fips_code: "12019",
    },
    {
      name: "Collier",
      fips_code: "12021",
    },
    {
      name: "Columbia",
      fips_code: "12023",
    },
    {
      name: "Dade",
      fips_code: "12025",
    },
    {
      name: "DeSoto",
      fips_code: "12027",
    },
    {
      name: "Dixie",
      fips_code: "12029",
    },
    {
      name: "Duval",
      fips_code: "12031",
    },
    {
      name: "Escambia",
      fips_code: "12033",
    },
    {
      name: "Flagler",
      fips_code: "12035",
    },
    {
      name: "Franklin",
      fips_code: "12037",
    },
    {
      name: "Gadsden",
      fips_code: "12039",
    },
    {
      name: "Gilchrist",
      fips_code: "12041",
    },
    {
      name: "Glades",
      fips_code: "12043",
    },
    {
      name: "Gulf",
      fips_code: "12045",
    },
    {
      name: "Hamilton",
      fips_code: "12047",
    },
    {
      name: "Hardee",
      fips_code: "12049",
    },
    {
      name: "Hendry",
      fips_code: "12051",
    },
    {
      name: "Hernando",
      fips_code: "12053",
    },
    {
      name: "Highlands",
      fips_code: "12055",
    },
    {
      name: "Hillsborough",
      fips_code: "12057",
    },
    {
      name: "Holmes",
      fips_code: "12059",
    },
    {
      name: "Indian River",
      fips_code: "12061",
    },
    {
      name: "Jackson",
      fips_code: "12063",
    },
    {
      name: "Jefferson",
      fips_code: "12065",
    },
    {
      name: "Lafayette",
      fips_code: "12067",
    },
    {
      name: "Lake",
      fips_code: "12069",
    },
    {
      name: "Lee",
      fips_code: "12071",
    },
    {
      name: "Leon",
      fips_code: "12073",
    },
    {
      name: "Levy",
      fips_code: "12075",
    },
    {
      name: "Liberty",
      fips_code: "12077",
    },
    {
      name: "Madison",
      fips_code: "12079",
    },
    {
      name: "Manatee",
      fips_code: "12081",
    },
    {
      name: "Marion",
      fips_code: "12083",
    },
    {
      name: "Martin",
      fips_code: "12085",
    },
    {
      name: "Monroe",
      fips_code: "12087",
    },
    {
      name: "Nassau",
      fips_code: "12089",
    },
    {
      name: "Okaloosa",
      fips_code: "12091",
    },
    {
      name: "Okeechobee",
      fips_code: "12093",
    },
    {
      name: "Orange",
      fips_code: "12095",
    },
    {
      name: "Osceola",
      fips_code: "12097",
    },
    {
      name: "Palm Beach",
      fips_code: "12099",
    },
    {
      name: "Pasco",
      fips_code: "12101",
    },
    {
      name: "Pinellas",
      fips_code: "12103",
    },
    {
      name: "Polk",
      fips_code: "12105",
    },
    {
      name: "Putnam",
      fips_code: "12107",
    },
    {
      name: "Santa Rosa",
      fips_code: "12113",
    },
    {
      name: "Sarasota",
      fips_code: "12115",
    },
    {
      name: "Seminole",
      fips_code: "12117",
    },
    {
      name: "St. Johns",
      fips_code: "12109",
    },
    {
      name: "St. Lucie",
      fips_code: "12111",
    },
    {
      name: "Sumter",
      fips_code: "12119",
    },
    {
      name: "Suwannee",
      fips_code: "12121",
    },
    {
      name: "Taylor",
      fips_code: "12123",
    },
    {
      name: "Union",
      fips_code: "12125",
    },
    {
      name: "Volusia",
      fips_code: "12127",
    },
    {
      name: "Wakulla",
      fips_code: "12129",
    },
    {
      name: "Walton",
      fips_code: "12131",
    },
    {
      name: "Washington",
      fips_code: "12133",
    },
  ],
  GA: [
    {
      name: "Appling",
      fips_code: "13001",
    },
    {
      name: "Atkinson",
      fips_code: "13003",
    },
    {
      name: "Bacon",
      fips_code: "13005",
    },
    {
      name: "Baker",
      fips_code: "13007",
    },
    {
      name: "Baldwin",
      fips_code: "13009",
    },
    {
      name: "Banks",
      fips_code: "13011",
    },
    {
      name: "Barrow",
      fips_code: "13013",
    },
    {
      name: "Bartow",
      fips_code: "13015",
    },
    {
      name: "Ben Hill",
      fips_code: "13017",
    },
    {
      name: "Berrien",
      fips_code: "13019",
    },
    {
      name: "Bibb",
      fips_code: "13021",
    },
    {
      name: "Bleckley",
      fips_code: "13023",
    },
    {
      name: "Brantley",
      fips_code: "13025",
    },
    {
      name: "Brooks",
      fips_code: "13027",
    },
    {
      name: "Bryan",
      fips_code: "13029",
    },
    {
      name: "Bulloch",
      fips_code: "13031",
    },
    {
      name: "Burke",
      fips_code: "13033",
    },
    {
      name: "Butts",
      fips_code: "13035",
    },
    {
      name: "Calhoun",
      fips_code: "13037",
    },
    {
      name: "Camden",
      fips_code: "13039",
    },
    {
      name: "Candler",
      fips_code: "13043",
    },
    {
      name: "Carroll",
      fips_code: "13045",
    },
    {
      name: "Catoosa",
      fips_code: "13047",
    },
    {
      name: "Charlton",
      fips_code: "13049",
    },
    {
      name: "Chatham",
      fips_code: "13051",
    },
    {
      name: "Chattahoochee",
      fips_code: "13053",
    },
    {
      name: "Chattooga",
      fips_code: "13055",
    },
    {
      name: "Cherokee",
      fips_code: "13057",
    },
    {
      name: "Clarke",
      fips_code: "13059",
    },
    {
      name: "Clay",
      fips_code: "13061",
    },
    {
      name: "Clayton",
      fips_code: "13063",
    },
    {
      name: "Clinch",
      fips_code: "13065",
    },
    {
      name: "Cobb",
      fips_code: "13067",
    },
    {
      name: "Coffee",
      fips_code: "13069",
    },
    {
      name: "Colquitt",
      fips_code: "13071",
    },
    {
      name: "Columbia",
      fips_code: "13073",
    },
    {
      name: "Cook",
      fips_code: "13075",
    },
    {
      name: "Coweta",
      fips_code: "13077",
    },
    {
      name: "Crawford",
      fips_code: "13079",
    },
    {
      name: "Crisp",
      fips_code: "13081",
    },
    {
      name: "Dade",
      fips_code: "13083",
    },
    {
      name: "Dawson",
      fips_code: "13085",
    },
    {
      name: "Decatur",
      fips_code: "13087",
    },
    {
      name: "DeKalb",
      fips_code: "13089",
    },
    {
      name: "Dodge",
      fips_code: "13091",
    },
    {
      name: "Dooly",
      fips_code: "13093",
    },
    {
      name: "Dougherty",
      fips_code: "13095",
    },
    {
      name: "Douglas",
      fips_code: "13097",
    },
    {
      name: "Early",
      fips_code: "13099",
    },
    {
      name: "Echols",
      fips_code: "13101",
    },
    {
      name: "Effingham",
      fips_code: "13103",
    },
    {
      name: "Elbert",
      fips_code: "13105",
    },
    {
      name: "Emanuel",
      fips_code: "13107",
    },
    {
      name: "Evans",
      fips_code: "13109",
    },
    {
      name: "Fannin",
      fips_code: "13111",
    },
    {
      name: "Fayette",
      fips_code: "13113",
    },
    {
      name: "Floyd",
      fips_code: "13115",
    },
    {
      name: "Forsyth",
      fips_code: "13117",
    },
    {
      name: "Franklin",
      fips_code: "13119",
    },
    {
      name: "Fulton",
      fips_code: "13121",
    },
    {
      name: "Gilmer",
      fips_code: "13123",
    },
    {
      name: "Glascock",
      fips_code: "13125",
    },
    {
      name: "Glynn",
      fips_code: "13127",
    },
    {
      name: "Gordon",
      fips_code: "13129",
    },
    {
      name: "Grady",
      fips_code: "13131",
    },
    {
      name: "Greene",
      fips_code: "13133",
    },
    {
      name: "Gwinnett",
      fips_code: "13135",
    },
    {
      name: "Habersham",
      fips_code: "13137",
    },
    {
      name: "Hall",
      fips_code: "13139",
    },
    {
      name: "Hancock",
      fips_code: "13141",
    },
    {
      name: "Haralson",
      fips_code: "13143",
    },
    {
      name: "Harris",
      fips_code: "13145",
    },
    {
      name: "Hart",
      fips_code: "13147",
    },
    {
      name: "Heard",
      fips_code: "13149",
    },
    {
      name: "Henry",
      fips_code: "13151",
    },
    {
      name: "Houston",
      fips_code: "13153",
    },
    {
      name: "Irwin",
      fips_code: "13155",
    },
    {
      name: "Jackson",
      fips_code: "13157",
    },
    {
      name: "Jasper",
      fips_code: "13159",
    },
    {
      name: "Jeff Davis",
      fips_code: "13161",
    },
    {
      name: "Jefferson",
      fips_code: "13163",
    },
    {
      name: "Jenkins",
      fips_code: "13165",
    },
    {
      name: "Johnson",
      fips_code: "13167",
    },
    {
      name: "Jones",
      fips_code: "13169",
    },
    {
      name: "Lamar",
      fips_code: "13171",
    },
    {
      name: "Lanier",
      fips_code: "13173",
    },
    {
      name: "Laurens",
      fips_code: "13175",
    },
    {
      name: "Lee",
      fips_code: "13177",
    },
    {
      name: "Liberty",
      fips_code: "13179",
    },
    {
      name: "Lincoln",
      fips_code: "13181",
    },
    {
      name: "Long",
      fips_code: "13183",
    },
    {
      name: "Lowndes",
      fips_code: "13185",
    },
    {
      name: "Lumpkin",
      fips_code: "13187",
    },
    {
      name: "Macon",
      fips_code: "13193",
    },
    {
      name: "Madison",
      fips_code: "13195",
    },
    {
      name: "Marion",
      fips_code: "13197",
    },
    {
      name: "McDuffie",
      fips_code: "13189",
    },
    {
      name: "McIntosh",
      fips_code: "13191",
    },
    {
      name: "Meriwether",
      fips_code: "13199",
    },
    {
      name: "Miller",
      fips_code: "13201",
    },
    {
      name: "Mitchell",
      fips_code: "13205",
    },
    {
      name: "Monroe",
      fips_code: "13207",
    },
    {
      name: "Montgomery",
      fips_code: "13209",
    },
    {
      name: "Morgan",
      fips_code: "13211",
    },
    {
      name: "Murray",
      fips_code: "13213",
    },
    {
      name: "Muscogee",
      fips_code: "13215",
    },
    {
      name: "Newton",
      fips_code: "13217",
    },
    {
      name: "Oconee",
      fips_code: "13219",
    },
    {
      name: "Oglethorpe",
      fips_code: "13221",
    },
    {
      name: "Paulding",
      fips_code: "13223",
    },
    {
      name: "Peach",
      fips_code: "13225",
    },
    {
      name: "Pickens",
      fips_code: "13227",
    },
    {
      name: "Pierce",
      fips_code: "13229",
    },
    {
      name: "Pike",
      fips_code: "13231",
    },
    {
      name: "Polk",
      fips_code: "13233",
    },
    {
      name: "Pulaski",
      fips_code: "13235",
    },
    {
      name: "Putnam",
      fips_code: "13237",
    },
    {
      name: "Quitman",
      fips_code: "13239",
    },
    {
      name: "Rabun",
      fips_code: "13241",
    },
    {
      name: "Randolph",
      fips_code: "13243",
    },
    {
      name: "Richmond",
      fips_code: "13245",
    },
    {
      name: "Rockdale",
      fips_code: "13247",
    },
    {
      name: "Schley",
      fips_code: "13249",
    },
    {
      name: "Screven",
      fips_code: "13251",
    },
    {
      name: "Seminole",
      fips_code: "13253",
    },
    {
      name: "Spalding",
      fips_code: "13255",
    },
    {
      name: "Stephens",
      fips_code: "13257",
    },
    {
      name: "Stewart",
      fips_code: "13259",
    },
    {
      name: "Sumter",
      fips_code: "13261",
    },
    {
      name: "Talbot",
      fips_code: "13263",
    },
    {
      name: "Taliaferro",
      fips_code: "13265",
    },
    {
      name: "Tattnall",
      fips_code: "13267",
    },
    {
      name: "Taylor",
      fips_code: "13269",
    },
    {
      name: "Telfair",
      fips_code: "13271",
    },
    {
      name: "Terrell",
      fips_code: "13273",
    },
    {
      name: "Thomas",
      fips_code: "13275",
    },
    {
      name: "Tift",
      fips_code: "13277",
    },
    {
      name: "Toombs",
      fips_code: "13279",
    },
    {
      name: "Towns",
      fips_code: "13281",
    },
    {
      name: "Treutlen",
      fips_code: "13283",
    },
    {
      name: "Troup",
      fips_code: "13285",
    },
    {
      name: "Turner",
      fips_code: "13287",
    },
    {
      name: "Twiggs",
      fips_code: "13289",
    },
    {
      name: "Union",
      fips_code: "13291",
    },
    {
      name: "Upson",
      fips_code: "13293",
    },
    {
      name: "Walker",
      fips_code: "13295",
    },
    {
      name: "Walton",
      fips_code: "13297",
    },
    {
      name: "Ware",
      fips_code: "13299",
    },
    {
      name: "Warren",
      fips_code: "13301",
    },
    {
      name: "Washington",
      fips_code: "13303",
    },
    {
      name: "Wayne",
      fips_code: "13305",
    },
    {
      name: "Webster",
      fips_code: "13307",
    },
    {
      name: "Wheeler",
      fips_code: "13309",
    },
    {
      name: "White",
      fips_code: "13311",
    },
    {
      name: "Whitfield",
      fips_code: "13313",
    },
    {
      name: "Wilcox",
      fips_code: "13315",
    },
    {
      name: "Wilkes",
      fips_code: "13317",
    },
    {
      name: "Wilkinson",
      fips_code: "13319",
    },
    {
      name: "Worth",
      fips_code: "13321",
    },
  ],
  HI: [
    {
      name: "Hawaii",
      fips_code: "15001",
    },
    {
      name: "Honolulu",
      fips_code: "15003",
    },
    {
      name: "Kalawao",
      fips_code: "15005",
    },
    {
      name: "Kauai",
      fips_code: "15007",
    },
    {
      name: "Maui",
      fips_code: "15009",
    },
  ],
  ID: [
    {
      name: "Ada",
      fips_code: "16001",
    },
    {
      name: "Adams",
      fips_code: "16003",
    },
    {
      name: "Bannock",
      fips_code: "16005",
    },
    {
      name: "Bear Lake",
      fips_code: "16007",
    },
    {
      name: "Benewah",
      fips_code: "16009",
    },
    {
      name: "Bingham",
      fips_code: "16011",
    },
    {
      name: "Blaine",
      fips_code: "16013",
    },
    {
      name: "Boise",
      fips_code: "16015",
    },
    {
      name: "Bonner",
      fips_code: "16017",
    },
    {
      name: "Bonneville",
      fips_code: "16019",
    },
    {
      name: "Boundary",
      fips_code: "16021",
    },
    {
      name: "Butte",
      fips_code: "16023",
    },
    {
      name: "Camas",
      fips_code: "16025",
    },
    {
      name: "Canyon",
      fips_code: "16027",
    },
    {
      name: "Caribou",
      fips_code: "16029",
    },
    {
      name: "Cassia",
      fips_code: "16031",
    },
    {
      name: "Clark",
      fips_code: "16033",
    },
    {
      name: "Clearwater",
      fips_code: "16035",
    },
    {
      name: "Custer",
      fips_code: "16037",
    },
    {
      name: "Elmore",
      fips_code: "16039",
    },
    {
      name: "Franklin",
      fips_code: "16041",
    },
    {
      name: "Fremont",
      fips_code: "16043",
    },
    {
      name: "Gem",
      fips_code: "16045",
    },
    {
      name: "Gooding",
      fips_code: "16047",
    },
    {
      name: "Idaho",
      fips_code: "16049",
    },
    {
      name: "Jefferson",
      fips_code: "16051",
    },
    {
      name: "Jerome",
      fips_code: "16053",
    },
    {
      name: "Kootenai",
      fips_code: "16055",
    },
    {
      name: "Latah",
      fips_code: "16057",
    },
    {
      name: "Lemhi",
      fips_code: "16059",
    },
    {
      name: "Lewis",
      fips_code: "16061",
    },
    {
      name: "Lincoln",
      fips_code: "16063",
    },
    {
      name: "Madison",
      fips_code: "16065",
    },
    {
      name: "Minidoka",
      fips_code: "16067",
    },
    {
      name: "Nez Perce",
      fips_code: "16069",
    },
    {
      name: "Oneida",
      fips_code: "16071",
    },
    {
      name: "Owyhee",
      fips_code: "16073",
    },
    {
      name: "Payette",
      fips_code: "16075",
    },
    {
      name: "Power",
      fips_code: "16077",
    },
    {
      name: "Shoshone",
      fips_code: "16079",
    },
    {
      name: "Teton",
      fips_code: "16081",
    },
    {
      name: "Twin Falls",
      fips_code: "16083",
    },
    {
      name: "Valley",
      fips_code: "16085",
    },
    {
      name: "Washington",
      fips_code: "16087",
    },
  ],
  IL: [
    {
      name: "Adams",
      fips_code: "17001",
    },
    {
      name: "Alexander",
      fips_code: "17003",
    },
    {
      name: "Bond",
      fips_code: "17005",
    },
    {
      name: "Boone",
      fips_code: "17007",
    },
    {
      name: "Brown",
      fips_code: "17009",
    },
    {
      name: "Bureau",
      fips_code: "17011",
    },
    {
      name: "Calhoun",
      fips_code: "17013",
    },
    {
      name: "Carroll",
      fips_code: "17015",
    },
    {
      name: "Cass",
      fips_code: "17017",
    },
    {
      name: "Champaign",
      fips_code: "17019",
    },
    {
      name: "Christian",
      fips_code: "17021",
    },
    {
      name: "Clark",
      fips_code: "17023",
    },
    {
      name: "Clay",
      fips_code: "17025",
    },
    {
      name: "Clinton",
      fips_code: "17027",
    },
    {
      name: "Coles",
      fips_code: "17029",
    },
    {
      name: "Cook",
      fips_code: "17031",
    },
    {
      name: "Crawford",
      fips_code: "17033",
    },
    {
      name: "Cumberland",
      fips_code: "17035",
    },
    {
      name: "De Witt",
      fips_code: "17039",
    },
    {
      name: "DeKalb",
      fips_code: "17037",
    },
    {
      name: "Douglas",
      fips_code: "17041",
    },
    {
      name: "DuPage",
      fips_code: "17043",
    },
    {
      name: "Edgar",
      fips_code: "17045",
    },
    {
      name: "Edwards",
      fips_code: "17047",
    },
    {
      name: "Effingham",
      fips_code: "17049",
    },
    {
      name: "Fayette",
      fips_code: "17051",
    },
    {
      name: "Ford",
      fips_code: "17053",
    },
    {
      name: "Franklin",
      fips_code: "17055",
    },
    {
      name: "Fulton",
      fips_code: "17057",
    },
    {
      name: "Gallatin",
      fips_code: "17059",
    },
    {
      name: "Greene",
      fips_code: "17061",
    },
    {
      name: "Grundy",
      fips_code: "17063",
    },
    {
      name: "Hamilton",
      fips_code: "17065",
    },
    {
      name: "Hancock",
      fips_code: "17067",
    },
    {
      name: "Hardin",
      fips_code: "17069",
    },
    {
      name: "Henderson",
      fips_code: "17071",
    },
    {
      name: "Henry",
      fips_code: "17073",
    },
    {
      name: "Iroquois",
      fips_code: "17075",
    },
    {
      name: "Jackson",
      fips_code: "17077",
    },
    {
      name: "Jasper",
      fips_code: "17079",
    },
    {
      name: "Jefferson",
      fips_code: "17081",
    },
    {
      name: "Jersey",
      fips_code: "17083",
    },
    {
      name: "Jo Daviess",
      fips_code: "17085",
    },
    {
      name: "Johnson",
      fips_code: "17087",
    },
    {
      name: "Kane",
      fips_code: "17089",
    },
    {
      name: "Kankakee",
      fips_code: "17091",
    },
    {
      name: "Kendall",
      fips_code: "17093",
    },
    {
      name: "Knox",
      fips_code: "17095",
    },
    {
      name: "La Salle",
      fips_code: "17099",
    },
    {
      name: "Lake",
      fips_code: "17097",
    },
    {
      name: "Lawrence",
      fips_code: "17101",
    },
    {
      name: "Lee",
      fips_code: "17103",
    },
    {
      name: "Livingston",
      fips_code: "17105",
    },
    {
      name: "Logan",
      fips_code: "17107",
    },
    {
      name: "Macon",
      fips_code: "17115",
    },
    {
      name: "Macoupin",
      fips_code: "17117",
    },
    {
      name: "Madison",
      fips_code: "17119",
    },
    {
      name: "Marion",
      fips_code: "17121",
    },
    {
      name: "Marshall",
      fips_code: "17123",
    },
    {
      name: "Mason",
      fips_code: "17125",
    },
    {
      name: "Massac",
      fips_code: "17127",
    },
    {
      name: "McDonough",
      fips_code: "17109",
    },
    {
      name: "McHenry",
      fips_code: "17111",
    },
    {
      name: "McLean",
      fips_code: "17113",
    },
    {
      name: "Menard",
      fips_code: "17129",
    },
    {
      name: "Mercer",
      fips_code: "17131",
    },
    {
      name: "Monroe",
      fips_code: "17133",
    },
    {
      name: "Montgomery",
      fips_code: "17135",
    },
    {
      name: "Morgan",
      fips_code: "17137",
    },
    {
      name: "Moultrie",
      fips_code: "17139",
    },
    {
      name: "Ogle",
      fips_code: "17141",
    },
    {
      name: "Peoria",
      fips_code: "17143",
    },
    {
      name: "Perry",
      fips_code: "17145",
    },
    {
      name: "Piatt",
      fips_code: "17147",
    },
    {
      name: "Pike",
      fips_code: "17149",
    },
    {
      name: "Pope",
      fips_code: "17151",
    },
    {
      name: "Pulaski",
      fips_code: "17153",
    },
    {
      name: "Putnam",
      fips_code: "17155",
    },
    {
      name: "Randolph",
      fips_code: "17157",
    },
    {
      name: "Richland",
      fips_code: "17159",
    },
    {
      name: "Rock Island",
      fips_code: "17161",
    },
    {
      name: "Saline",
      fips_code: "17165",
    },
    {
      name: "Sangamon",
      fips_code: "17167",
    },
    {
      name: "Schuyler",
      fips_code: "17169",
    },
    {
      name: "Scott",
      fips_code: "17171",
    },
    {
      name: "Shelby",
      fips_code: "17173",
    },
    {
      name: "St. Clair",
      fips_code: "17163",
    },
    {
      name: "Stark",
      fips_code: "17175",
    },
    {
      name: "Stephenson",
      fips_code: "17177",
    },
    {
      name: "Tazewell",
      fips_code: "17179",
    },
    {
      name: "Union",
      fips_code: "17181",
    },
    {
      name: "Vermilion",
      fips_code: "17183",
    },
    {
      name: "Wabash",
      fips_code: "17185",
    },
    {
      name: "Warren",
      fips_code: "17187",
    },
    {
      name: "Washington",
      fips_code: "17189",
    },
    {
      name: "Wayne",
      fips_code: "17191",
    },
    {
      name: "White",
      fips_code: "17193",
    },
    {
      name: "Whiteside",
      fips_code: "17195",
    },
    {
      name: "Will",
      fips_code: "17197",
    },
    {
      name: "Williamson",
      fips_code: "17199",
    },
    {
      name: "Winnebago",
      fips_code: "17201",
    },
    {
      name: "Woodford",
      fips_code: "17203",
    },
  ],
  IN: [
    {
      name: "Adams",
      fips_code: "18001",
    },
    {
      name: "Allen",
      fips_code: "18003",
    },
    {
      name: "Bartholomew",
      fips_code: "18005",
    },
    {
      name: "Benton",
      fips_code: "18007",
    },
    {
      name: "Blackford",
      fips_code: "18009",
    },
    {
      name: "Boone",
      fips_code: "18011",
    },
    {
      name: "Brown",
      fips_code: "18013",
    },
    {
      name: "Carroll",
      fips_code: "18015",
    },
    {
      name: "Cass",
      fips_code: "18017",
    },
    {
      name: "Clark",
      fips_code: "18019",
    },
    {
      name: "Clay",
      fips_code: "18021",
    },
    {
      name: "Clinton",
      fips_code: "18023",
    },
    {
      name: "Crawford",
      fips_code: "18025",
    },
    {
      name: "Daviess",
      fips_code: "18027",
    },
    {
      name: "De Kalb",
      fips_code: "18033",
    },
    {
      name: "Dearborn",
      fips_code: "18029",
    },
    {
      name: "Decatur",
      fips_code: "18031",
    },
    {
      name: "Delaware",
      fips_code: "18035",
    },
    {
      name: "Dubois",
      fips_code: "18037",
    },
    {
      name: "Elkhart",
      fips_code: "18039",
    },
    {
      name: "Fayette",
      fips_code: "18041",
    },
    {
      name: "Floyd",
      fips_code: "18043",
    },
    {
      name: "Fountain",
      fips_code: "18045",
    },
    {
      name: "Franklin",
      fips_code: "18047",
    },
    {
      name: "Fulton",
      fips_code: "18049",
    },
    {
      name: "Gibson",
      fips_code: "18051",
    },
    {
      name: "Grant",
      fips_code: "18053",
    },
    {
      name: "Greene",
      fips_code: "18055",
    },
    {
      name: "Hamilton",
      fips_code: "18057",
    },
    {
      name: "Hancock",
      fips_code: "18059",
    },
    {
      name: "Harrison",
      fips_code: "18061",
    },
    {
      name: "Hendricks",
      fips_code: "18063",
    },
    {
      name: "Henry",
      fips_code: "18065",
    },
    {
      name: "Howard",
      fips_code: "18067",
    },
    {
      name: "Huntington",
      fips_code: "18069",
    },
    {
      name: "Jackson",
      fips_code: "18071",
    },
    {
      name: "Jasper",
      fips_code: "18073",
    },
    {
      name: "Jay",
      fips_code: "18075",
    },
    {
      name: "Jefferson",
      fips_code: "18077",
    },
    {
      name: "Jennings",
      fips_code: "18079",
    },
    {
      name: "Johnson",
      fips_code: "18081",
    },
    {
      name: "Knox",
      fips_code: "18083",
    },
    {
      name: "Kosciusko",
      fips_code: "18085",
    },
    {
      name: "La Porte",
      fips_code: "18091",
    },
    {
      name: "Lagrange",
      fips_code: "18087",
    },
    {
      name: "Lake",
      fips_code: "18089",
    },
    {
      name: "Lawrence",
      fips_code: "18093",
    },
    {
      name: "Madison",
      fips_code: "18095",
    },
    {
      name: "Marion",
      fips_code: "18097",
    },
    {
      name: "Marshall",
      fips_code: "18099",
    },
    {
      name: "Martin",
      fips_code: "18101",
    },
    {
      name: "Miami",
      fips_code: "18103",
    },
    {
      name: "Monroe",
      fips_code: "18105",
    },
    {
      name: "Montgomery",
      fips_code: "18107",
    },
    {
      name: "Morgan",
      fips_code: "18109",
    },
    {
      name: "Newton",
      fips_code: "18111",
    },
    {
      name: "Noble",
      fips_code: "18113",
    },
    {
      name: "Ohio",
      fips_code: "18115",
    },
    {
      name: "Orange",
      fips_code: "18117",
    },
    {
      name: "Owen",
      fips_code: "18119",
    },
    {
      name: "Parke",
      fips_code: "18121",
    },
    {
      name: "Perry",
      fips_code: "18123",
    },
    {
      name: "Pike",
      fips_code: "18125",
    },
    {
      name: "Porter",
      fips_code: "18127",
    },
    {
      name: "Posey",
      fips_code: "18129",
    },
    {
      name: "Pulaski",
      fips_code: "18131",
    },
    {
      name: "Putnam",
      fips_code: "18133",
    },
    {
      name: "Randolph",
      fips_code: "18135",
    },
    {
      name: "Ripley",
      fips_code: "18137",
    },
    {
      name: "Rush",
      fips_code: "18139",
    },
    {
      name: "Scott",
      fips_code: "18143",
    },
    {
      name: "Shelby",
      fips_code: "18145",
    },
    {
      name: "Spencer",
      fips_code: "18147",
    },
    {
      name: "St. Joseph",
      fips_code: "18141",
    },
    {
      name: "Starke",
      fips_code: "18149",
    },
    {
      name: "Steuben",
      fips_code: "18151",
    },
    {
      name: "Sullivan",
      fips_code: "18153",
    },
    {
      name: "Switzerland",
      fips_code: "18155",
    },
    {
      name: "Tippecanoe",
      fips_code: "18157",
    },
    {
      name: "Tipton",
      fips_code: "18159",
    },
    {
      name: "Union",
      fips_code: "18161",
    },
    {
      name: "Vanderburgh",
      fips_code: "18163",
    },
    {
      name: "Vermillion",
      fips_code: "18165",
    },
    {
      name: "Vigo",
      fips_code: "18167",
    },
    {
      name: "Wabash",
      fips_code: "18169",
    },
    {
      name: "Warren",
      fips_code: "18171",
    },
    {
      name: "Warrick",
      fips_code: "18173",
    },
    {
      name: "Washington",
      fips_code: "18175",
    },
    {
      name: "Wayne",
      fips_code: "18177",
    },
    {
      name: "Wells",
      fips_code: "18179",
    },
    {
      name: "White",
      fips_code: "18181",
    },
    {
      name: "Whitley",
      fips_code: "18183",
    },
  ],
  IA: [
    {
      name: "Adair",
      fips_code: "19001",
    },
    {
      name: "Adams",
      fips_code: "19003",
    },
    {
      name: "Allamakee",
      fips_code: "19005",
    },
    {
      name: "Appanoose",
      fips_code: "19007",
    },
    {
      name: "Audubon",
      fips_code: "19009",
    },
    {
      name: "Benton",
      fips_code: "19011",
    },
    {
      name: "Black Hawk",
      fips_code: "19013",
    },
    {
      name: "Boone",
      fips_code: "19015",
    },
    {
      name: "Bremer",
      fips_code: "19017",
    },
    {
      name: "Buchanan",
      fips_code: "19019",
    },
    {
      name: "Buena Vista",
      fips_code: "19021",
    },
    {
      name: "Butler",
      fips_code: "19023",
    },
    {
      name: "Calhoun",
      fips_code: "19025",
    },
    {
      name: "Carroll",
      fips_code: "19027",
    },
    {
      name: "Cass",
      fips_code: "19029",
    },
    {
      name: "Cedar",
      fips_code: "19031",
    },
    {
      name: "Cerro Gordo",
      fips_code: "19033",
    },
    {
      name: "Cherokee",
      fips_code: "19035",
    },
    {
      name: "Chickasaw",
      fips_code: "19037",
    },
    {
      name: "Clarke",
      fips_code: "19039",
    },
    {
      name: "Clay",
      fips_code: "19041",
    },
    {
      name: "Clayton",
      fips_code: "19043",
    },
    {
      name: "Clinton",
      fips_code: "19045",
    },
    {
      name: "Crawford",
      fips_code: "19047",
    },
    {
      name: "Dallas",
      fips_code: "19049",
    },
    {
      name: "Davis",
      fips_code: "19051",
    },
    {
      name: "Decatur",
      fips_code: "19053",
    },
    {
      name: "Delaware",
      fips_code: "19055",
    },
    {
      name: "Des Moines",
      fips_code: "19057",
    },
    {
      name: "Dickinson",
      fips_code: "19059",
    },
    {
      name: "Dubuque",
      fips_code: "19061",
    },
    {
      name: "Emmet",
      fips_code: "19063",
    },
    {
      name: "Fayette",
      fips_code: "19065",
    },
    {
      name: "Floyd",
      fips_code: "19067",
    },
    {
      name: "Franklin",
      fips_code: "19069",
    },
    {
      name: "Fremont",
      fips_code: "19071",
    },
    {
      name: "Greene",
      fips_code: "19073",
    },
    {
      name: "Grundy",
      fips_code: "19075",
    },
    {
      name: "Guthrie",
      fips_code: "19077",
    },
    {
      name: "Hamilton",
      fips_code: "19079",
    },
    {
      name: "Hancock",
      fips_code: "19081",
    },
    {
      name: "Hardin",
      fips_code: "19083",
    },
    {
      name: "Harrison",
      fips_code: "19085",
    },
    {
      name: "Henry",
      fips_code: "19087",
    },
    {
      name: "Howard",
      fips_code: "19089",
    },
    {
      name: "Humboldt",
      fips_code: "19091",
    },
    {
      name: "Ida",
      fips_code: "19093",
    },
    {
      name: "Iowa",
      fips_code: "19095",
    },
    {
      name: "Jackson",
      fips_code: "19097",
    },
    {
      name: "Jasper",
      fips_code: "19099",
    },
    {
      name: "Jefferson",
      fips_code: "19101",
    },
    {
      name: "Johnson",
      fips_code: "19103",
    },
    {
      name: "Jones",
      fips_code: "19105",
    },
    {
      name: "Keokuk",
      fips_code: "19107",
    },
    {
      name: "Kossuth",
      fips_code: "19109",
    },
    {
      name: "Lee",
      fips_code: "19111",
    },
    {
      name: "Linn",
      fips_code: "19113",
    },
    {
      name: "Louisa",
      fips_code: "19115",
    },
    {
      name: "Lucas",
      fips_code: "19117",
    },
    {
      name: "Lyon",
      fips_code: "19119",
    },
    {
      name: "Madison",
      fips_code: "19121",
    },
    {
      name: "Mahaska",
      fips_code: "19123",
    },
    {
      name: "Marion",
      fips_code: "19125",
    },
    {
      name: "Marshall",
      fips_code: "19127",
    },
    {
      name: "Mills",
      fips_code: "19129",
    },
    {
      name: "Mitchell",
      fips_code: "19131",
    },
    {
      name: "Monona",
      fips_code: "19133",
    },
    {
      name: "Monroe",
      fips_code: "19135",
    },
    {
      name: "Montgomery",
      fips_code: "19137",
    },
    {
      name: "Muscatine",
      fips_code: "19139",
    },
    {
      name: "O",
      fips_code: "19141",
    },
    {
      name: "Osceola",
      fips_code: "19143",
    },
    {
      name: "Page",
      fips_code: "19145",
    },
    {
      name: "Palo Alto",
      fips_code: "19147",
    },
    {
      name: "Plymouth",
      fips_code: "19149",
    },
    {
      name: "Pocahontas",
      fips_code: "19151",
    },
    {
      name: "Polk",
      fips_code: "19153",
    },
    {
      name: "Pottawattamie",
      fips_code: "19155",
    },
    {
      name: "Poweshiek",
      fips_code: "19157",
    },
    {
      name: "Ringgold",
      fips_code: "19159",
    },
    {
      name: "Sac",
      fips_code: "19161",
    },
    {
      name: "Scott",
      fips_code: "19163",
    },
    {
      name: "Shelby",
      fips_code: "19165",
    },
    {
      name: "Sioux",
      fips_code: "19167",
    },
    {
      name: "Story",
      fips_code: "19169",
    },
    {
      name: "Tama",
      fips_code: "19171",
    },
    {
      name: "Taylor",
      fips_code: "19173",
    },
    {
      name: "Union",
      fips_code: "19175",
    },
    {
      name: "Van Buren",
      fips_code: "19177",
    },
    {
      name: "Wapello",
      fips_code: "19179",
    },
    {
      name: "Warren",
      fips_code: "19181",
    },
    {
      name: "Washington",
      fips_code: "19183",
    },
    {
      name: "Wayne",
      fips_code: "19185",
    },
    {
      name: "Webster",
      fips_code: "19187",
    },
    {
      name: "Winnebago",
      fips_code: "19189",
    },
    {
      name: "Winneshiek",
      fips_code: "19191",
    },
    {
      name: "Woodbury",
      fips_code: "19193",
    },
    {
      name: "Worth",
      fips_code: "19195",
    },
    {
      name: "Wright",
      fips_code: "19197",
    },
  ],
  KS: [
    {
      name: "Allen",
      fips_code: "20001",
    },
    {
      name: "Anderson",
      fips_code: "20003",
    },
    {
      name: "Atchison",
      fips_code: "20005",
    },
    {
      name: "Barber",
      fips_code: "20007",
    },
    {
      name: "Barton",
      fips_code: "20009",
    },
    {
      name: "Bourbon",
      fips_code: "20011",
    },
    {
      name: "Brown",
      fips_code: "20013",
    },
    {
      name: "Butler",
      fips_code: "20015",
    },
    {
      name: "Chase",
      fips_code: "20017",
    },
    {
      name: "Chautauqua",
      fips_code: "20019",
    },
    {
      name: "Cherokee",
      fips_code: "20021",
    },
    {
      name: "Cheyenne",
      fips_code: "20023",
    },
    {
      name: "Clark",
      fips_code: "20025",
    },
    {
      name: "Clay",
      fips_code: "20027",
    },
    {
      name: "Cloud",
      fips_code: "20029",
    },
    {
      name: "Coffey",
      fips_code: "20031",
    },
    {
      name: "Comanche",
      fips_code: "20033",
    },
    {
      name: "Cowley",
      fips_code: "20035",
    },
    {
      name: "Crawford",
      fips_code: "20037",
    },
    {
      name: "Decatur",
      fips_code: "20039",
    },
    {
      name: "Dickinson",
      fips_code: "20041",
    },
    {
      name: "Doniphan",
      fips_code: "20043",
    },
    {
      name: "Douglas",
      fips_code: "20045",
    },
    {
      name: "Edwards",
      fips_code: "20047",
    },
    {
      name: "Elk",
      fips_code: "20049",
    },
    {
      name: "Ellis",
      fips_code: "20051",
    },
    {
      name: "Ellsworth",
      fips_code: "20053",
    },
    {
      name: "Finney",
      fips_code: "20055",
    },
    {
      name: "Ford",
      fips_code: "20057",
    },
    {
      name: "Franklin",
      fips_code: "20059",
    },
    {
      name: "Geary",
      fips_code: "20061",
    },
    {
      name: "Gove",
      fips_code: "20063",
    },
    {
      name: "Graham",
      fips_code: "20065",
    },
    {
      name: "Grant",
      fips_code: "20067",
    },
    {
      name: "Gray",
      fips_code: "20069",
    },
    {
      name: "Greeley",
      fips_code: "20071",
    },
    {
      name: "Greenwood",
      fips_code: "20073",
    },
    {
      name: "Hamilton",
      fips_code: "20075",
    },
    {
      name: "Harper",
      fips_code: "20077",
    },
    {
      name: "Harvey",
      fips_code: "20079",
    },
    {
      name: "Haskell",
      fips_code: "20081",
    },
    {
      name: "Hodgeman",
      fips_code: "20083",
    },
    {
      name: "Jackson",
      fips_code: "20085",
    },
    {
      name: "Jefferson",
      fips_code: "20087",
    },
    {
      name: "Jewell",
      fips_code: "20089",
    },
    {
      name: "Johnson",
      fips_code: "20091",
    },
    {
      name: "Kearny",
      fips_code: "20093",
    },
    {
      name: "Kingman",
      fips_code: "20095",
    },
    {
      name: "Kiowa",
      fips_code: "20097",
    },
    {
      name: "Labette",
      fips_code: "20099",
    },
    {
      name: "Lane",
      fips_code: "20101",
    },
    {
      name: "Leavenworth",
      fips_code: "20103",
    },
    {
      name: "Lincoln",
      fips_code: "20105",
    },
    {
      name: "Linn",
      fips_code: "20107",
    },
    {
      name: "Logan",
      fips_code: "20109",
    },
    {
      name: "Lyon",
      fips_code: "20111",
    },
    {
      name: "Marion",
      fips_code: "20115",
    },
    {
      name: "Marshall",
      fips_code: "20117",
    },
    {
      name: "McPherson",
      fips_code: "20113",
    },
    {
      name: "Meade",
      fips_code: "20119",
    },
    {
      name: "Miami",
      fips_code: "20121",
    },
    {
      name: "Mitchell",
      fips_code: "20123",
    },
    {
      name: "Montgomery",
      fips_code: "20125",
    },
    {
      name: "Morris",
      fips_code: "20127",
    },
    {
      name: "Morton",
      fips_code: "20129",
    },
    {
      name: "Nemaha",
      fips_code: "20131",
    },
    {
      name: "Neosho",
      fips_code: "20133",
    },
    {
      name: "Ness",
      fips_code: "20135",
    },
    {
      name: "Norton",
      fips_code: "20137",
    },
    {
      name: "Osage",
      fips_code: "20139",
    },
    {
      name: "Osborne",
      fips_code: "20141",
    },
    {
      name: "Ottawa",
      fips_code: "20143",
    },
    {
      name: "Pawnee",
      fips_code: "20145",
    },
    {
      name: "Phillips",
      fips_code: "20147",
    },
    {
      name: "Pottawatomie",
      fips_code: "20149",
    },
    {
      name: "Pratt",
      fips_code: "20151",
    },
    {
      name: "Rawlins",
      fips_code: "20153",
    },
    {
      name: "Reno",
      fips_code: "20155",
    },
    {
      name: "Republic",
      fips_code: "20157",
    },
    {
      name: "Rice",
      fips_code: "20159",
    },
    {
      name: "Riley",
      fips_code: "20161",
    },
    {
      name: "Rooks",
      fips_code: "20163",
    },
    {
      name: "Rush",
      fips_code: "20165",
    },
    {
      name: "Russell",
      fips_code: "20167",
    },
    {
      name: "Saline",
      fips_code: "20169",
    },
    {
      name: "Scott",
      fips_code: "20171",
    },
    {
      name: "Sedgwick",
      fips_code: "20173",
    },
    {
      name: "Seward",
      fips_code: "20175",
    },
    {
      name: "Shawnee",
      fips_code: "20177",
    },
    {
      name: "Sheridan",
      fips_code: "20179",
    },
    {
      name: "Sherman",
      fips_code: "20181",
    },
    {
      name: "Smith",
      fips_code: "20183",
    },
    {
      name: "Stafford",
      fips_code: "20185",
    },
    {
      name: "Stanton",
      fips_code: "20187",
    },
    {
      name: "Stevens",
      fips_code: "20189",
    },
    {
      name: "Sumner",
      fips_code: "20191",
    },
    {
      name: "Thomas",
      fips_code: "20193",
    },
    {
      name: "Trego",
      fips_code: "20195",
    },
    {
      name: "Wabaunsee",
      fips_code: "20197",
    },
    {
      name: "Wallace",
      fips_code: "20199",
    },
    {
      name: "Washington",
      fips_code: "20201",
    },
    {
      name: "Wichita",
      fips_code: "20203",
    },
    {
      name: "Wilson",
      fips_code: "20205",
    },
    {
      name: "Woodson",
      fips_code: "20207",
    },
    {
      name: "Wyandotte",
      fips_code: "20209",
    },
  ],
  KY: [
    {
      name: "Adair",
      fips_code: "21001",
    },
    {
      name: "Allen",
      fips_code: "21003",
    },
    {
      name: "Anderson",
      fips_code: "21005",
    },
    {
      name: "Ballard",
      fips_code: "21007",
    },
    {
      name: "Barren",
      fips_code: "21009",
    },
    {
      name: "Bath",
      fips_code: "21011",
    },
    {
      name: "Bell",
      fips_code: "21013",
    },
    {
      name: "Boone",
      fips_code: "21015",
    },
    {
      name: "Bourbon",
      fips_code: "21017",
    },
    {
      name: "Boyd",
      fips_code: "21019",
    },
    {
      name: "Boyle",
      fips_code: "21021",
    },
    {
      name: "Bracken",
      fips_code: "21023",
    },
    {
      name: "Breathitt",
      fips_code: "21025",
    },
    {
      name: "Breckinridge",
      fips_code: "21027",
    },
    {
      name: "Bullitt",
      fips_code: "21029",
    },
    {
      name: "Butler",
      fips_code: "21031",
    },
    {
      name: "Caldwell",
      fips_code: "21033",
    },
    {
      name: "Calloway",
      fips_code: "21035",
    },
    {
      name: "Campbell",
      fips_code: "21037",
    },
    {
      name: "Carlisle",
      fips_code: "21039",
    },
    {
      name: "Carroll",
      fips_code: "21041",
    },
    {
      name: "Carter",
      fips_code: "21043",
    },
    {
      name: "Casey",
      fips_code: "21045",
    },
    {
      name: "Christian",
      fips_code: "21047",
    },
    {
      name: "Clark",
      fips_code: "21049",
    },
    {
      name: "Clay",
      fips_code: "21051",
    },
    {
      name: "Clinton",
      fips_code: "21053",
    },
    {
      name: "Crittenden",
      fips_code: "21055",
    },
    {
      name: "Cumberland",
      fips_code: "21057",
    },
    {
      name: "Daviess",
      fips_code: "21059",
    },
    {
      name: "Edmonson",
      fips_code: "21061",
    },
    {
      name: "Elliott",
      fips_code: "21063",
    },
    {
      name: "Estill",
      fips_code: "21065",
    },
    {
      name: "Fayette",
      fips_code: "21067",
    },
    {
      name: "Fleming",
      fips_code: "21069",
    },
    {
      name: "Floyd",
      fips_code: "21071",
    },
    {
      name: "Franklin",
      fips_code: "21073",
    },
    {
      name: "Fulton",
      fips_code: "21075",
    },
    {
      name: "Gallatin",
      fips_code: "21077",
    },
    {
      name: "Garrard",
      fips_code: "21079",
    },
    {
      name: "Grant",
      fips_code: "21081",
    },
    {
      name: "Graves",
      fips_code: "21083",
    },
    {
      name: "Grayson",
      fips_code: "21085",
    },
    {
      name: "Green",
      fips_code: "21087",
    },
    {
      name: "Greenup",
      fips_code: "21089",
    },
    {
      name: "Hancock",
      fips_code: "21091",
    },
    {
      name: "Hardin",
      fips_code: "21093",
    },
    {
      name: "Harlan",
      fips_code: "21095",
    },
    {
      name: "Harrison",
      fips_code: "21097",
    },
    {
      name: "Hart",
      fips_code: "21099",
    },
    {
      name: "Henderson",
      fips_code: "21101",
    },
    {
      name: "Henry",
      fips_code: "21103",
    },
    {
      name: "Hickman",
      fips_code: "21105",
    },
    {
      name: "Hopkins",
      fips_code: "21107",
    },
    {
      name: "Jackson",
      fips_code: "21109",
    },
    {
      name: "Jefferson",
      fips_code: "21111",
    },
    {
      name: "Jessamine",
      fips_code: "21113",
    },
    {
      name: "Johnson",
      fips_code: "21115",
    },
    {
      name: "Kenton",
      fips_code: "21117",
    },
    {
      name: "Knott",
      fips_code: "21119",
    },
    {
      name: "Knox",
      fips_code: "21121",
    },
    {
      name: "Larue",
      fips_code: "21123",
    },
    {
      name: "Laurel",
      fips_code: "21125",
    },
    {
      name: "Lawrence",
      fips_code: "21127",
    },
    {
      name: "Lee",
      fips_code: "21129",
    },
    {
      name: "Leslie",
      fips_code: "21131",
    },
    {
      name: "Letcher",
      fips_code: "21133",
    },
    {
      name: "Lewis",
      fips_code: "21135",
    },
    {
      name: "Lincoln",
      fips_code: "21137",
    },
    {
      name: "Livingston",
      fips_code: "21139",
    },
    {
      name: "Logan",
      fips_code: "21141",
    },
    {
      name: "Lyon",
      fips_code: "21143",
    },
    {
      name: "Madison",
      fips_code: "21151",
    },
    {
      name: "Magoffin",
      fips_code: "21153",
    },
    {
      name: "Marion",
      fips_code: "21155",
    },
    {
      name: "Marshall",
      fips_code: "21157",
    },
    {
      name: "Martin",
      fips_code: "21159",
    },
    {
      name: "Mason",
      fips_code: "21161",
    },
    {
      name: "McCracken",
      fips_code: "21145",
    },
    {
      name: "McCreary",
      fips_code: "21147",
    },
    {
      name: "McLean",
      fips_code: "21149",
    },
    {
      name: "Meade",
      fips_code: "21163",
    },
    {
      name: "Menifee",
      fips_code: "21165",
    },
    {
      name: "Mercer",
      fips_code: "21167",
    },
    {
      name: "Metcalfe",
      fips_code: "21169",
    },
    {
      name: "Monroe",
      fips_code: "21171",
    },
    {
      name: "Montgomery",
      fips_code: "21173",
    },
    {
      name: "Morgan",
      fips_code: "21175",
    },
    {
      name: "Muhlenberg",
      fips_code: "21177",
    },
    {
      name: "Nelson",
      fips_code: "21179",
    },
    {
      name: "Nicholas",
      fips_code: "21181",
    },
    {
      name: "Ohio",
      fips_code: "21183",
    },
    {
      name: "Oldham",
      fips_code: "21185",
    },
    {
      name: "Owen",
      fips_code: "21187",
    },
    {
      name: "Owsley",
      fips_code: "21189",
    },
    {
      name: "Pendleton",
      fips_code: "21191",
    },
    {
      name: "Perry",
      fips_code: "21193",
    },
    {
      name: "Pike",
      fips_code: "21195",
    },
    {
      name: "Powell",
      fips_code: "21197",
    },
    {
      name: "Pulaski",
      fips_code: "21199",
    },
    {
      name: "Robertson",
      fips_code: "21201",
    },
    {
      name: "Rockcastle",
      fips_code: "21203",
    },
    {
      name: "Rowan",
      fips_code: "21205",
    },
    {
      name: "Russell",
      fips_code: "21207",
    },
    {
      name: "Scott",
      fips_code: "21209",
    },
    {
      name: "Shelby",
      fips_code: "21211",
    },
    {
      name: "Simpson",
      fips_code: "21213",
    },
    {
      name: "Spencer",
      fips_code: "21215",
    },
    {
      name: "Taylor",
      fips_code: "21217",
    },
    {
      name: "Todd",
      fips_code: "21219",
    },
    {
      name: "Trigg",
      fips_code: "21221",
    },
    {
      name: "Trimble",
      fips_code: "21223",
    },
    {
      name: "Union",
      fips_code: "21225",
    },
    {
      name: "Warren",
      fips_code: "21227",
    },
    {
      name: "Washington",
      fips_code: "21229",
    },
    {
      name: "Wayne",
      fips_code: "21231",
    },
    {
      name: "Webster",
      fips_code: "21233",
    },
    {
      name: "Whitley",
      fips_code: "21235",
    },
    {
      name: "Wolfe",
      fips_code: "21237",
    },
    {
      name: "Woodford",
      fips_code: "21239",
    },
  ],
  LA: [
    {
      name: "Acadia",
      fips_code: "22001",
    },
    {
      name: "Allen",
      fips_code: "22003",
    },
    {
      name: "Ascension",
      fips_code: "22005",
    },
    {
      name: "Assumption",
      fips_code: "22007",
    },
    {
      name: "Avoyelles",
      fips_code: "22009",
    },
    {
      name: "Beauregard",
      fips_code: "22011",
    },
    {
      name: "Bienville",
      fips_code: "22013",
    },
    {
      name: "Bossier",
      fips_code: "22015",
    },
    {
      name: "Caddo",
      fips_code: "22017",
    },
    {
      name: "Calcasieu",
      fips_code: "22019",
    },
    {
      name: "Caldwell",
      fips_code: "22021",
    },
    {
      name: "Cameron",
      fips_code: "22023",
    },
    {
      name: "Catahoula",
      fips_code: "22025",
    },
    {
      name: "Claiborne",
      fips_code: "22027",
    },
    {
      name: "Concordia",
      fips_code: "22029",
    },
    {
      name: "De Soto",
      fips_code: "22031",
    },
    {
      name: "East Baton Rouge",
      fips_code: "22033",
    },
    {
      name: "East Carroll",
      fips_code: "22035",
    },
    {
      name: "East Feliciana",
      fips_code: "22037",
    },
    {
      name: "Evangeline",
      fips_code: "22039",
    },
    {
      name: "Franklin",
      fips_code: "22041",
    },
    {
      name: "Grant",
      fips_code: "22043",
    },
    {
      name: "Iberia",
      fips_code: "22045",
    },
    {
      name: "Iberville",
      fips_code: "22047",
    },
    {
      name: "Jackson",
      fips_code: "22049",
    },
    {
      name: "Jefferson",
      fips_code: "22051",
    },
    {
      name: "Jefferson Davis",
      fips_code: "22053",
    },
    {
      name: "La Salle",
      fips_code: "22059",
    },
    {
      name: "Lafayette",
      fips_code: "22055",
    },
    {
      name: "Lafourche",
      fips_code: "22057",
    },
    {
      name: "Lincoln",
      fips_code: "22061",
    },
    {
      name: "Livingston",
      fips_code: "22063",
    },
    {
      name: "Madison",
      fips_code: "22065",
    },
    {
      name: "Morehouse",
      fips_code: "22067",
    },
    {
      name: "Natchitoches",
      fips_code: "22069",
    },
    {
      name: "Orleans",
      fips_code: "22071",
    },
    {
      name: "Ouachita",
      fips_code: "22073",
    },
    {
      name: "Plaquemines",
      fips_code: "22075",
    },
    {
      name: "Pointe Coupee",
      fips_code: "22077",
    },
    {
      name: "Rapides",
      fips_code: "22079",
    },
    {
      name: "Red River",
      fips_code: "22081",
    },
    {
      name: "Richland",
      fips_code: "22083",
    },
    {
      name: "Sabine",
      fips_code: "22085",
    },
    {
      name: "St. Bernard",
      fips_code: "22087",
    },
    {
      name: "St. Charles",
      fips_code: "22089",
    },
    {
      name: "St. Helena",
      fips_code: "22091",
    },
    {
      name: "St. James",
      fips_code: "22093",
    },
    {
      name: "St. John the Baptist",
      fips_code: "22095",
    },
    {
      name: "St. Landry",
      fips_code: "22097",
    },
    {
      name: "St. Martin",
      fips_code: "22099",
    },
    {
      name: "St. Mary",
      fips_code: "22101",
    },
    {
      name: "St. Tammany",
      fips_code: "22103",
    },
    {
      name: "Tangipahoa",
      fips_code: "22105",
    },
    {
      name: "Tensas",
      fips_code: "22107",
    },
    {
      name: "Terrebonne",
      fips_code: "22109",
    },
    {
      name: "Union",
      fips_code: "22111",
    },
    {
      name: "Vermilion",
      fips_code: "22113",
    },
    {
      name: "Vernon",
      fips_code: "22115",
    },
    {
      name: "Washington",
      fips_code: "22117",
    },
    {
      name: "Webster",
      fips_code: "22119",
    },
    {
      name: "West Baton Rouge",
      fips_code: "22121",
    },
    {
      name: "West Carroll",
      fips_code: "22123",
    },
    {
      name: "West Feliciana",
      fips_code: "22125",
    },
    {
      name: "Winn",
      fips_code: "22127",
    },
  ],
  ME: [
    {
      name: "Androscoggin",
      fips_code: "23001",
    },
    {
      name: "Aroostook",
      fips_code: "23003",
    },
    {
      name: "Cumberland",
      fips_code: "23005",
    },
    {
      name: "Franklin",
      fips_code: "23007",
    },
    {
      name: "Hancock",
      fips_code: "23009",
    },
    {
      name: "Kennebec",
      fips_code: "23011",
    },
    {
      name: "Knox",
      fips_code: "23013",
    },
    {
      name: "Lincoln",
      fips_code: "23015",
    },
    {
      name: "Oxford",
      fips_code: "23017",
    },
    {
      name: "Penobscot",
      fips_code: "23019",
    },
    {
      name: "Piscataquis",
      fips_code: "23021",
    },
    {
      name: "Sagadahoc",
      fips_code: "23023",
    },
    {
      name: "Somerset",
      fips_code: "23025",
    },
    {
      name: "Waldo",
      fips_code: "23027",
    },
    {
      name: "Washington",
      fips_code: "23029",
    },
    {
      name: "York",
      fips_code: "23031",
    },
  ],
  MD: [
    {
      name: "Allegany",
      fips_code: "24001",
    },
    {
      name: "Anne Arundel",
      fips_code: "24003",
    },
    {
      name: "Baltimore",
      fips_code: "24005",
    },
    {
      name: "Baltimore (City)",
      fips_code: "24510",
    },
    {
      name: "Calvert",
      fips_code: "24009",
    },
    {
      name: "Caroline",
      fips_code: "24011",
    },
    {
      name: "Carroll",
      fips_code: "24013",
    },
    {
      name: "Cecil",
      fips_code: "24015",
    },
    {
      name: "Charles",
      fips_code: "24017",
    },
    {
      name: "Dorchester",
      fips_code: "24019",
    },
    {
      name: "Frederick",
      fips_code: "24021",
    },
    {
      name: "Garrett",
      fips_code: "24023",
    },
    {
      name: "Harford",
      fips_code: "24025",
    },
    {
      name: "Howard",
      fips_code: "24027",
    },
    {
      name: "Kent",
      fips_code: "24029",
    },
    {
      name: "Montgomery",
      fips_code: "24031",
    },
    {
      name: "Prince George",
      fips_code: "24033",
    },
    {
      name: "Queen Anne",
      fips_code: "24035",
    },
    {
      name: "Somerset",
      fips_code: "24039",
    },
    {
      name: "St. Mary",
      fips_code: "24037",
    },
    {
      name: "Talbot",
      fips_code: "24041",
    },
    {
      name: "Washington",
      fips_code: "24043",
    },
    {
      name: "Wicomico",
      fips_code: "24045",
    },
    {
      name: "Worcester",
      fips_code: "24047",
    },
  ],
  MA: [
    {
      name: "Barnstable",
      fips_code: "25001",
    },
    {
      name: "Berkshire",
      fips_code: "25003",
    },
    {
      name: "Bristol",
      fips_code: "25005",
    },
    {
      name: "Dukes",
      fips_code: "25007",
    },
    {
      name: "Essex",
      fips_code: "25009",
    },
    {
      name: "Franklin",
      fips_code: "25011",
    },
    {
      name: "Hampden",
      fips_code: "25013",
    },
    {
      name: "Hampshire",
      fips_code: "25015",
    },
    {
      name: "Middlesex",
      fips_code: "25017",
    },
    {
      name: "Nantucket",
      fips_code: "25019",
    },
    {
      name: "Norfolk",
      fips_code: "25021",
    },
    {
      name: "Plymouth",
      fips_code: "25023",
    },
    {
      name: "Suffolk",
      fips_code: "25025",
    },
    {
      name: "Worcester",
      fips_code: "25027",
    },
  ],
  MI: [
    {
      name: "Alcona",
      fips_code: "26001",
    },
    {
      name: "Alger",
      fips_code: "26003",
    },
    {
      name: "Allegan",
      fips_code: "26005",
    },
    {
      name: "Alpena",
      fips_code: "26007",
    },
    {
      name: "Antrim",
      fips_code: "26009",
    },
    {
      name: "Arenac",
      fips_code: "26011",
    },
    {
      name: "Baraga",
      fips_code: "26013",
    },
    {
      name: "Barry",
      fips_code: "26015",
    },
    {
      name: "Bay",
      fips_code: "26017",
    },
    {
      name: "Benzie",
      fips_code: "26019",
    },
    {
      name: "Berrien",
      fips_code: "26021",
    },
    {
      name: "Branch",
      fips_code: "26023",
    },
    {
      name: "Calhoun",
      fips_code: "26025",
    },
    {
      name: "Cass",
      fips_code: "26027",
    },
    {
      name: "Charlevoix",
      fips_code: "26029",
    },
    {
      name: "Cheboygan",
      fips_code: "26031",
    },
    {
      name: "Chippewa",
      fips_code: "26033",
    },
    {
      name: "Clare",
      fips_code: "26035",
    },
    {
      name: "Clinton",
      fips_code: "26037",
    },
    {
      name: "Crawford",
      fips_code: "26039",
    },
    {
      name: "Delta",
      fips_code: "26041",
    },
    {
      name: "Dickinson",
      fips_code: "26043",
    },
    {
      name: "Eaton",
      fips_code: "26045",
    },
    {
      name: "Emmet",
      fips_code: "26047",
    },
    {
      name: "Genesee",
      fips_code: "26049",
    },
    {
      name: "Gladwin",
      fips_code: "26051",
    },
    {
      name: "Gogebic",
      fips_code: "26053",
    },
    {
      name: "Grand Traverse",
      fips_code: "26055",
    },
    {
      name: "Gratiot",
      fips_code: "26057",
    },
    {
      name: "Hillsdale",
      fips_code: "26059",
    },
    {
      name: "Houghton",
      fips_code: "26061",
    },
    {
      name: "Huron",
      fips_code: "26063",
    },
    {
      name: "Ingham",
      fips_code: "26065",
    },
    {
      name: "Ionia",
      fips_code: "26067",
    },
    {
      name: "Iosco",
      fips_code: "26069",
    },
    {
      name: "Iron",
      fips_code: "26071",
    },
    {
      name: "Isabella",
      fips_code: "26073",
    },
    {
      name: "Jackson",
      fips_code: "26075",
    },
    {
      name: "Kalamazoo",
      fips_code: "26077",
    },
    {
      name: "Kalkaska",
      fips_code: "26079",
    },
    {
      name: "Kent",
      fips_code: "26081",
    },
    {
      name: "Keweenaw",
      fips_code: "26083",
    },
    {
      name: "Lake",
      fips_code: "26085",
    },
    {
      name: "Lapeer",
      fips_code: "26087",
    },
    {
      name: "Leelanau",
      fips_code: "26089",
    },
    {
      name: "Lenawee",
      fips_code: "26091",
    },
    {
      name: "Livingston",
      fips_code: "26093",
    },
    {
      name: "Luce",
      fips_code: "26095",
    },
    {
      name: "Mackinac",
      fips_code: "26097",
    },
    {
      name: "Macomb",
      fips_code: "26099",
    },
    {
      name: "Manistee",
      fips_code: "26101",
    },
    {
      name: "Marquette",
      fips_code: "26103",
    },
    {
      name: "Mason",
      fips_code: "26105",
    },
    {
      name: "Mecosta",
      fips_code: "26107",
    },
    {
      name: "Menominee",
      fips_code: "26109",
    },
    {
      name: "Midland",
      fips_code: "26111",
    },
    {
      name: "Missaukee",
      fips_code: "26113",
    },
    {
      name: "Monroe",
      fips_code: "26115",
    },
    {
      name: "Montcalm",
      fips_code: "26117",
    },
    {
      name: "Montmorency",
      fips_code: "26119",
    },
    {
      name: "Muskegon",
      fips_code: "26121",
    },
    {
      name: "Newaygo",
      fips_code: "26123",
    },
    {
      name: "Oakland",
      fips_code: "26125",
    },
    {
      name: "Oceana",
      fips_code: "26127",
    },
    {
      name: "Ogemaw",
      fips_code: "26129",
    },
    {
      name: "Ontonagon",
      fips_code: "26131",
    },
    {
      name: "Osceola",
      fips_code: "26133",
    },
    {
      name: "Oscoda",
      fips_code: "26135",
    },
    {
      name: "Otsego",
      fips_code: "26137",
    },
    {
      name: "Ottawa",
      fips_code: "26139",
    },
    {
      name: "Presque Isle",
      fips_code: "26141",
    },
    {
      name: "Roscommon",
      fips_code: "26143",
    },
    {
      name: "Saginaw",
      fips_code: "26145",
    },
    {
      name: "Sanilac",
      fips_code: "26151",
    },
    {
      name: "Schoolcraft",
      fips_code: "26153",
    },
    {
      name: "Shiawassee",
      fips_code: "26155",
    },
    {
      name: "St. Clair",
      fips_code: "26147",
    },
    {
      name: "St. Joseph",
      fips_code: "26149",
    },
    {
      name: "Tuscola",
      fips_code: "26157",
    },
    {
      name: "Van Buren",
      fips_code: "26159",
    },
    {
      name: "Washtenaw",
      fips_code: "26161",
    },
    {
      name: "Wayne",
      fips_code: "26163",
    },
    {
      name: "Wexford",
      fips_code: "26165",
    },
  ],
  MN: [
    {
      name: "Aitkin",
      fips_code: "27001",
    },
    {
      name: "Anoka",
      fips_code: "27003",
    },
    {
      name: "Becker",
      fips_code: "27005",
    },
    {
      name: "Beltrami",
      fips_code: "27007",
    },
    {
      name: "Benton",
      fips_code: "27009",
    },
    {
      name: "Big Stone",
      fips_code: "27011",
    },
    {
      name: "Blue Earth",
      fips_code: "27013",
    },
    {
      name: "Brown",
      fips_code: "27015",
    },
    {
      name: "Carlton",
      fips_code: "27017",
    },
    {
      name: "Carver",
      fips_code: "27019",
    },
    {
      name: "Cass",
      fips_code: "27021",
    },
    {
      name: "Chippewa",
      fips_code: "27023",
    },
    {
      name: "Chisago",
      fips_code: "27025",
    },
    {
      name: "Clay",
      fips_code: "27027",
    },
    {
      name: "Clearwater",
      fips_code: "27029",
    },
    {
      name: "Cook",
      fips_code: "27031",
    },
    {
      name: "Cottonwood",
      fips_code: "27033",
    },
    {
      name: "Crow Wing",
      fips_code: "27035",
    },
    {
      name: "Dakota",
      fips_code: "27037",
    },
    {
      name: "Dodge",
      fips_code: "27039",
    },
    {
      name: "Douglas",
      fips_code: "27041",
    },
    {
      name: "Faribault",
      fips_code: "27043",
    },
    {
      name: "Fillmore",
      fips_code: "27045",
    },
    {
      name: "Freeborn",
      fips_code: "27047",
    },
    {
      name: "Goodhue",
      fips_code: "27049",
    },
    {
      name: "Grant",
      fips_code: "27051",
    },
    {
      name: "Hennepin",
      fips_code: "27053",
    },
    {
      name: "Houston",
      fips_code: "27055",
    },
    {
      name: "Hubbard",
      fips_code: "27057",
    },
    {
      name: "Isanti",
      fips_code: "27059",
    },
    {
      name: "Itasca",
      fips_code: "27061",
    },
    {
      name: "Jackson",
      fips_code: "27063",
    },
    {
      name: "Kanabec",
      fips_code: "27065",
    },
    {
      name: "Kandiyohi",
      fips_code: "27067",
    },
    {
      name: "Kittson",
      fips_code: "27069",
    },
    {
      name: "Koochiching",
      fips_code: "27071",
    },
    {
      name: "Lac qui Parle",
      fips_code: "27073",
    },
    {
      name: "Lake",
      fips_code: "27075",
    },
    {
      name: "Lake of the Woods",
      fips_code: "27077",
    },
    {
      name: "Le Sueur",
      fips_code: "27079",
    },
    {
      name: "Lincoln",
      fips_code: "27081",
    },
    {
      name: "Lyon",
      fips_code: "27083",
    },
    {
      name: "Mahnomen",
      fips_code: "27087",
    },
    {
      name: "Marshall",
      fips_code: "27089",
    },
    {
      name: "Martin",
      fips_code: "27091",
    },
    {
      name: "McLeod",
      fips_code: "27085",
    },
    {
      name: "Meeker",
      fips_code: "27093",
    },
    {
      name: "Mille Lacs",
      fips_code: "27095",
    },
    {
      name: "Morrison",
      fips_code: "27097",
    },
    {
      name: "Mower",
      fips_code: "27099",
    },
    {
      name: "Murray",
      fips_code: "27101",
    },
    {
      name: "Nicollet",
      fips_code: "27103",
    },
    {
      name: "Nobles",
      fips_code: "27105",
    },
    {
      name: "Norman",
      fips_code: "27107",
    },
    {
      name: "Olmsted",
      fips_code: "27109",
    },
    {
      name: "Otter Tail",
      fips_code: "27111",
    },
    {
      name: "Pennington",
      fips_code: "27113",
    },
    {
      name: "Pine",
      fips_code: "27115",
    },
    {
      name: "Pipestone",
      fips_code: "27117",
    },
    {
      name: "Polk",
      fips_code: "27119",
    },
    {
      name: "Pope",
      fips_code: "27121",
    },
    {
      name: "Ramsey",
      fips_code: "27123",
    },
    {
      name: "Red Lake",
      fips_code: "27125",
    },
    {
      name: "Redwood",
      fips_code: "27127",
    },
    {
      name: "Renville",
      fips_code: "27129",
    },
    {
      name: "Rice",
      fips_code: "27131",
    },
    {
      name: "Rock",
      fips_code: "27133",
    },
    {
      name: "Roseau",
      fips_code: "27135",
    },
    {
      name: "Scott",
      fips_code: "27139",
    },
    {
      name: "Sherburne",
      fips_code: "27141",
    },
    {
      name: "Sibley",
      fips_code: "27143",
    },
    {
      name: "St. Louis",
      fips_code: "27137",
    },
    {
      name: "Stearns",
      fips_code: "27145",
    },
    {
      name: "Steele",
      fips_code: "27147",
    },
    {
      name: "Stevens",
      fips_code: "27149",
    },
    {
      name: "Swift",
      fips_code: "27151",
    },
    {
      name: "Todd",
      fips_code: "27153",
    },
    {
      name: "Traverse",
      fips_code: "27155",
    },
    {
      name: "Wabasha",
      fips_code: "27157",
    },
    {
      name: "Wadena",
      fips_code: "27159",
    },
    {
      name: "Waseca",
      fips_code: "27161",
    },
    {
      name: "Washington",
      fips_code: "27163",
    },
    {
      name: "Watonwan",
      fips_code: "27165",
    },
    {
      name: "Wilkin",
      fips_code: "27167",
    },
    {
      name: "Winona",
      fips_code: "27169",
    },
    {
      name: "Wright",
      fips_code: "27171",
    },
    {
      name: "Yellow Medicine",
      fips_code: "27173",
    },
  ],
  MS: [
    {
      name: "Adams",
      fips_code: "28001",
    },
    {
      name: "Alcorn",
      fips_code: "28003",
    },
    {
      name: "Amite",
      fips_code: "28005",
    },
    {
      name: "Attala",
      fips_code: "28007",
    },
    {
      name: "Benton",
      fips_code: "28009",
    },
    {
      name: "Bolivar",
      fips_code: "28011",
    },
    {
      name: "Calhoun",
      fips_code: "28013",
    },
    {
      name: "Carroll",
      fips_code: "28015",
    },
    {
      name: "Chickasaw",
      fips_code: "28017",
    },
    {
      name: "Choctaw",
      fips_code: "28019",
    },
    {
      name: "Claiborne",
      fips_code: "28021",
    },
    {
      name: "Clarke",
      fips_code: "28023",
    },
    {
      name: "Clay",
      fips_code: "28025",
    },
    {
      name: "Coahoma",
      fips_code: "28027",
    },
    {
      name: "Copiah",
      fips_code: "28029",
    },
    {
      name: "Covington",
      fips_code: "28031",
    },
    {
      name: "DeSoto",
      fips_code: "28033",
    },
    {
      name: "Forrest",
      fips_code: "28035",
    },
    {
      name: "Franklin",
      fips_code: "28037",
    },
    {
      name: "George",
      fips_code: "28039",
    },
    {
      name: "Greene",
      fips_code: "28041",
    },
    {
      name: "Grenada",
      fips_code: "28043",
    },
    {
      name: "Hancock",
      fips_code: "28045",
    },
    {
      name: "Harrison",
      fips_code: "28047",
    },
    {
      name: "Hinds",
      fips_code: "28049",
    },
    {
      name: "Holmes",
      fips_code: "28051",
    },
    {
      name: "Humphreys",
      fips_code: "28053",
    },
    {
      name: "Issaquena",
      fips_code: "28055",
    },
    {
      name: "Itawamba",
      fips_code: "28057",
    },
    {
      name: "Jackson",
      fips_code: "28059",
    },
    {
      name: "Jasper",
      fips_code: "28061",
    },
    {
      name: "Jefferson",
      fips_code: "28063",
    },
    {
      name: "Jefferson Davis",
      fips_code: "28065",
    },
    {
      name: "Jones",
      fips_code: "28067",
    },
    {
      name: "Kemper",
      fips_code: "28069",
    },
    {
      name: "Lafayette",
      fips_code: "28071",
    },
    {
      name: "Lamar",
      fips_code: "28073",
    },
    {
      name: "Lauderdale",
      fips_code: "28075",
    },
    {
      name: "Lawrence",
      fips_code: "28077",
    },
    {
      name: "Leake",
      fips_code: "28079",
    },
    {
      name: "Lee",
      fips_code: "28081",
    },
    {
      name: "Leflore",
      fips_code: "28083",
    },
    {
      name: "Lincoln",
      fips_code: "28085",
    },
    {
      name: "Lowndes",
      fips_code: "28087",
    },
    {
      name: "Madison",
      fips_code: "28089",
    },
    {
      name: "Marion",
      fips_code: "28091",
    },
    {
      name: "Marshall",
      fips_code: "28093",
    },
    {
      name: "Monroe",
      fips_code: "28095",
    },
    {
      name: "Montgomery",
      fips_code: "28097",
    },
    {
      name: "Neshoba",
      fips_code: "28099",
    },
    {
      name: "Newton",
      fips_code: "28101",
    },
    {
      name: "Noxubee",
      fips_code: "28103",
    },
    {
      name: "Oktibbeha",
      fips_code: "28105",
    },
    {
      name: "Panola",
      fips_code: "28107",
    },
    {
      name: "Pearl River",
      fips_code: "28109",
    },
    {
      name: "Perry",
      fips_code: "28111",
    },
    {
      name: "Pike",
      fips_code: "28113",
    },
    {
      name: "Pontotoc",
      fips_code: "28115",
    },
    {
      name: "Prentiss",
      fips_code: "28117",
    },
    {
      name: "Quitman",
      fips_code: "28119",
    },
    {
      name: "Rankin",
      fips_code: "28121",
    },
    {
      name: "Scott",
      fips_code: "28123",
    },
    {
      name: "Sharkey",
      fips_code: "28125",
    },
    {
      name: "Simpson",
      fips_code: "28127",
    },
    {
      name: "Smith",
      fips_code: "28129",
    },
    {
      name: "Stone",
      fips_code: "28131",
    },
    {
      name: "Sunflower",
      fips_code: "28133",
    },
    {
      name: "Tallahatchie",
      fips_code: "28135",
    },
    {
      name: "Tate",
      fips_code: "28137",
    },
    {
      name: "Tippah",
      fips_code: "28139",
    },
    {
      name: "Tishomingo",
      fips_code: "28141",
    },
    {
      name: "Tunica",
      fips_code: "28143",
    },
    {
      name: "Union",
      fips_code: "28145",
    },
    {
      name: "Walthall",
      fips_code: "28147",
    },
    {
      name: "Warren",
      fips_code: "28149",
    },
    {
      name: "Washington",
      fips_code: "28151",
    },
    {
      name: "Wayne",
      fips_code: "28153",
    },
    {
      name: "Webster",
      fips_code: "28155",
    },
    {
      name: "Wilkinson",
      fips_code: "28157",
    },
    {
      name: "Winston",
      fips_code: "28159",
    },
    {
      name: "Yalobusha",
      fips_code: "28161",
    },
    {
      name: "Yazoo",
      fips_code: "28163",
    },
  ],
  MO: [
    {
      name: "Adair",
      fips_code: "29001",
    },
    {
      name: "Andrew",
      fips_code: "29003",
    },
    {
      name: "Atchison",
      fips_code: "29005",
    },
    {
      name: "Audrain",
      fips_code: "29007",
    },
    {
      name: "Barry",
      fips_code: "29009",
    },
    {
      name: "Barton",
      fips_code: "29011",
    },
    {
      name: "Bates",
      fips_code: "29013",
    },
    {
      name: "Benton",
      fips_code: "29015",
    },
    {
      name: "Bollinger",
      fips_code: "29017",
    },
    {
      name: "Boone",
      fips_code: "29019",
    },
    {
      name: "Buchanan",
      fips_code: "29021",
    },
    {
      name: "Butler",
      fips_code: "29023",
    },
    {
      name: "Caldwell",
      fips_code: "29025",
    },
    {
      name: "Callaway",
      fips_code: "29027",
    },
    {
      name: "Camden",
      fips_code: "29029",
    },
    {
      name: "Cape Girardeau",
      fips_code: "29031",
    },
    {
      name: "Carroll",
      fips_code: "29033",
    },
    {
      name: "Carter",
      fips_code: "29035",
    },
    {
      name: "Cass",
      fips_code: "29037",
    },
    {
      name: "Cedar",
      fips_code: "29039",
    },
    {
      name: "Chariton",
      fips_code: "29041",
    },
    {
      name: "Christian",
      fips_code: "29043",
    },
    {
      name: "Clark",
      fips_code: "29045",
    },
    {
      name: "Clay",
      fips_code: "29047",
    },
    {
      name: "Clinton",
      fips_code: "29049",
    },
    {
      name: "Cole",
      fips_code: "29051",
    },
    {
      name: "Cooper",
      fips_code: "29053",
    },
    {
      name: "Crawford",
      fips_code: "29055",
    },
    {
      name: "Dade",
      fips_code: "29057",
    },
    {
      name: "Dallas",
      fips_code: "29059",
    },
    {
      name: "Daviess",
      fips_code: "29061",
    },
    {
      name: "DeKalb",
      fips_code: "29063",
    },
    {
      name: "Dent",
      fips_code: "29065",
    },
    {
      name: "Douglas",
      fips_code: "29067",
    },
    {
      name: "Dunklin",
      fips_code: "29069",
    },
    {
      name: "Franklin",
      fips_code: "29071",
    },
    {
      name: "Gasconade",
      fips_code: "29073",
    },
    {
      name: "Gentry",
      fips_code: "29075",
    },
    {
      name: "Greene",
      fips_code: "29077",
    },
    {
      name: "Grundy",
      fips_code: "29079",
    },
    {
      name: "Harrison",
      fips_code: "29081",
    },
    {
      name: "Henry",
      fips_code: "29083",
    },
    {
      name: "Hickory",
      fips_code: "29085",
    },
    {
      name: "Holt",
      fips_code: "29087",
    },
    {
      name: "Howard",
      fips_code: "29089",
    },
    {
      name: "Howell",
      fips_code: "29091",
    },
    {
      name: "Iron",
      fips_code: "29093",
    },
    {
      name: "Jackson",
      fips_code: "29095",
    },
    {
      name: "Jasper",
      fips_code: "29097",
    },
    {
      name: "Jefferson",
      fips_code: "29099",
    },
    {
      name: "Johnson",
      fips_code: "29101",
    },
    {
      name: "Knox",
      fips_code: "29103",
    },
    {
      name: "Laclede",
      fips_code: "29105",
    },
    {
      name: "Lafayette",
      fips_code: "29107",
    },
    {
      name: "Lawrence",
      fips_code: "29109",
    },
    {
      name: "Lewis",
      fips_code: "29111",
    },
    {
      name: "Lincoln",
      fips_code: "29113",
    },
    {
      name: "Linn",
      fips_code: "29115",
    },
    {
      name: "Livingston",
      fips_code: "29117",
    },
    {
      name: "Macon",
      fips_code: "29121",
    },
    {
      name: "Madison",
      fips_code: "29123",
    },
    {
      name: "Maries",
      fips_code: "29125",
    },
    {
      name: "Marion",
      fips_code: "29127",
    },
    {
      name: "McDonald",
      fips_code: "29119",
    },
    {
      name: "Mercer",
      fips_code: "29129",
    },
    {
      name: "Miller",
      fips_code: "29131",
    },
    {
      name: "Mississippi",
      fips_code: "29133",
    },
    {
      name: "Moniteau",
      fips_code: "29135",
    },
    {
      name: "Monroe",
      fips_code: "29137",
    },
    {
      name: "Montgomery",
      fips_code: "29139",
    },
    {
      name: "Morgan",
      fips_code: "29141",
    },
    {
      name: "New Madrid",
      fips_code: "29143",
    },
    {
      name: "Newton",
      fips_code: "29145",
    },
    {
      name: "Nodaway",
      fips_code: "29147",
    },
    {
      name: "Oregon",
      fips_code: "29149",
    },
    {
      name: "Osage",
      fips_code: "29151",
    },
    {
      name: "Ozark",
      fips_code: "29153",
    },
    {
      name: "Pemiscot",
      fips_code: "29155",
    },
    {
      name: "Perry",
      fips_code: "29157",
    },
    {
      name: "Pettis",
      fips_code: "29159",
    },
    {
      name: "Phelps",
      fips_code: "29161",
    },
    {
      name: "Pike",
      fips_code: "29163",
    },
    {
      name: "Platte",
      fips_code: "29165",
    },
    {
      name: "Polk",
      fips_code: "29167",
    },
    {
      name: "Pulaski",
      fips_code: "29169",
    },
    {
      name: "Putnam",
      fips_code: "29171",
    },
    {
      name: "Ralls",
      fips_code: "29173",
    },
    {
      name: "Randolph",
      fips_code: "29175",
    },
    {
      name: "Ray",
      fips_code: "29177",
    },
    {
      name: "Reynolds",
      fips_code: "29179",
    },
    {
      name: "Ripley",
      fips_code: "29181",
    },
    {
      name: "Saline",
      fips_code: "29195",
    },
    {
      name: "Schuyler",
      fips_code: "29197",
    },
    {
      name: "Scotland",
      fips_code: "29199",
    },
    {
      name: "Scott",
      fips_code: "29201",
    },
    {
      name: "Shannon",
      fips_code: "29203",
    },
    {
      name: "Shelby",
      fips_code: "29205",
    },
    {
      name: "St. Charles",
      fips_code: "29183",
    },
    {
      name: "St. Clair",
      fips_code: "29185",
    },
    {
      name: "St. Francois",
      fips_code: "29187",
    },
    {
      name: "St. Louis",
      fips_code: "29189",
    },
    {
      name: "St. Louis (City)",
      fips_code: "29510",
    },
    {
      name: "Ste. Genevieve",
      fips_code: "29186",
    },
    {
      name: "Stoddard",
      fips_code: "29207",
    },
    {
      name: "Stone",
      fips_code: "29209",
    },
    {
      name: "Sullivan",
      fips_code: "29211",
    },
    {
      name: "Taney",
      fips_code: "29213",
    },
    {
      name: "Texas",
      fips_code: "29215",
    },
    {
      name: "Vernon",
      fips_code: "29217",
    },
    {
      name: "Warren",
      fips_code: "29219",
    },
    {
      name: "Washington",
      fips_code: "29221",
    },
    {
      name: "Wayne",
      fips_code: "29223",
    },
    {
      name: "Webster",
      fips_code: "29225",
    },
    {
      name: "Worth",
      fips_code: "29227",
    },
    {
      name: "Wright",
      fips_code: "29229",
    },
  ],
  MT: [
    {
      name: "Beaverhead",
      fips_code: "30001",
    },
    {
      name: "Big Horn",
      fips_code: "30003",
    },
    {
      name: "Blaine",
      fips_code: "30005",
    },
    {
      name: "Broadwater",
      fips_code: "30007",
    },
    {
      name: "Carbon",
      fips_code: "30009",
    },
    {
      name: "Carter",
      fips_code: "30011",
    },
    {
      name: "Cascade",
      fips_code: "30013",
    },
    {
      name: "Chouteau",
      fips_code: "30015",
    },
    {
      name: "Custer",
      fips_code: "30017",
    },
    {
      name: "Daniels",
      fips_code: "30019",
    },
    {
      name: "Dawson",
      fips_code: "30021",
    },
    {
      name: "Deer Lodge",
      fips_code: "30023",
    },
    {
      name: "Fallon",
      fips_code: "30025",
    },
    {
      name: "Fergus",
      fips_code: "30027",
    },
    {
      name: "Flathead",
      fips_code: "30029",
    },
    {
      name: "Gallatin",
      fips_code: "30031",
    },
    {
      name: "Garfield",
      fips_code: "30033",
    },
    {
      name: "Glacier",
      fips_code: "30035",
    },
    {
      name: "Golden Valley",
      fips_code: "30037",
    },
    {
      name: "Granite",
      fips_code: "30039",
    },
    {
      name: "Hill",
      fips_code: "30041",
    },
    {
      name: "Jefferson",
      fips_code: "30043",
    },
    {
      name: "Judith Basin",
      fips_code: "30045",
    },
    {
      name: "Lake",
      fips_code: "30047",
    },
    {
      name: "Lewis and Clark",
      fips_code: "30049",
    },
    {
      name: "Liberty",
      fips_code: "30051",
    },
    {
      name: "Lincoln",
      fips_code: "30053",
    },
    {
      name: "Madison",
      fips_code: "30057",
    },
    {
      name: "McCone",
      fips_code: "30055",
    },
    {
      name: "Meagher",
      fips_code: "30059",
    },
    {
      name: "Mineral",
      fips_code: "30061",
    },
    {
      name: "Missoula",
      fips_code: "30063",
    },
    {
      name: "Musselshell",
      fips_code: "30065",
    },
    {
      name: "Park",
      fips_code: "30067",
    },
    {
      name: "Petroleum",
      fips_code: "30069",
    },
    {
      name: "Phillips",
      fips_code: "30071",
    },
    {
      name: "Pondera",
      fips_code: "30073",
    },
    {
      name: "Powder River",
      fips_code: "30075",
    },
    {
      name: "Powell",
      fips_code: "30077",
    },
    {
      name: "Prairie",
      fips_code: "30079",
    },
    {
      name: "Ravalli",
      fips_code: "30081",
    },
    {
      name: "Richland",
      fips_code: "30083",
    },
    {
      name: "Roosevelt",
      fips_code: "30085",
    },
    {
      name: "Rosebud",
      fips_code: "30087",
    },
    {
      name: "Sanders",
      fips_code: "30089",
    },
    {
      name: "Sheridan",
      fips_code: "30091",
    },
    {
      name: "Silver Bow",
      fips_code: "30093",
    },
    {
      name: "Stillwater",
      fips_code: "30095",
    },
    {
      name: "Sweet Grass",
      fips_code: "30097",
    },
    {
      name: "Teton",
      fips_code: "30099",
    },
    {
      name: "Toole",
      fips_code: "30101",
    },
    {
      name: "Treasure",
      fips_code: "30103",
    },
    {
      name: "Valley",
      fips_code: "30105",
    },
    {
      name: "Wheatland",
      fips_code: "30107",
    },
    {
      name: "Wibaux",
      fips_code: "30109",
    },
    {
      name: "Yellowstone",
      fips_code: "30111",
    },
    {
      name: "Yellowstone National Park",
      fips_code: "30113",
    },
  ],
  NE: [
    {
      name: "Adams",
      fips_code: "31001",
    },
    {
      name: "Antelope",
      fips_code: "31003",
    },
    {
      name: "Arthur",
      fips_code: "31005",
    },
    {
      name: "Banner",
      fips_code: "31007",
    },
    {
      name: "Blaine",
      fips_code: "31009",
    },
    {
      name: "Boone",
      fips_code: "31011",
    },
    {
      name: "Box Butte",
      fips_code: "31013",
    },
    {
      name: "Boyd",
      fips_code: "31015",
    },
    {
      name: "Brown",
      fips_code: "31017",
    },
    {
      name: "Buffalo",
      fips_code: "31019",
    },
    {
      name: "Burt",
      fips_code: "31021",
    },
    {
      name: "Butler",
      fips_code: "31023",
    },
    {
      name: "Cass",
      fips_code: "31025",
    },
    {
      name: "Cedar",
      fips_code: "31027",
    },
    {
      name: "Chase",
      fips_code: "31029",
    },
    {
      name: "Cherry",
      fips_code: "31031",
    },
    {
      name: "Cheyenne",
      fips_code: "31033",
    },
    {
      name: "Clay",
      fips_code: "31035",
    },
    {
      name: "Colfax",
      fips_code: "31037",
    },
    {
      name: "Cuming",
      fips_code: "31039",
    },
    {
      name: "Custer",
      fips_code: "31041",
    },
    {
      name: "Dakota",
      fips_code: "31043",
    },
    {
      name: "Dawes",
      fips_code: "31045",
    },
    {
      name: "Dawson",
      fips_code: "31047",
    },
    {
      name: "Deuel",
      fips_code: "31049",
    },
    {
      name: "Dixon",
      fips_code: "31051",
    },
    {
      name: "Dodge",
      fips_code: "31053",
    },
    {
      name: "Douglas",
      fips_code: "31055",
    },
    {
      name: "Dundy",
      fips_code: "31057",
    },
    {
      name: "Fillmore",
      fips_code: "31059",
    },
    {
      name: "Franklin",
      fips_code: "31061",
    },
    {
      name: "Frontier",
      fips_code: "31063",
    },
    {
      name: "Furnas",
      fips_code: "31065",
    },
    {
      name: "Gage",
      fips_code: "31067",
    },
    {
      name: "Garden",
      fips_code: "31069",
    },
    {
      name: "Garfield",
      fips_code: "31071",
    },
    {
      name: "Gosper",
      fips_code: "31073",
    },
    {
      name: "Grant",
      fips_code: "31075",
    },
    {
      name: "Greeley",
      fips_code: "31077",
    },
    {
      name: "Hall",
      fips_code: "31079",
    },
    {
      name: "Hamilton",
      fips_code: "31081",
    },
    {
      name: "Harlan",
      fips_code: "31083",
    },
    {
      name: "Hayes",
      fips_code: "31085",
    },
    {
      name: "Hitchcock",
      fips_code: "31087",
    },
    {
      name: "Holt",
      fips_code: "31089",
    },
    {
      name: "Hooker",
      fips_code: "31091",
    },
    {
      name: "Howard",
      fips_code: "31093",
    },
    {
      name: "Jefferson",
      fips_code: "31095",
    },
    {
      name: "Johnson",
      fips_code: "31097",
    },
    {
      name: "Kearney",
      fips_code: "31099",
    },
    {
      name: "Keith",
      fips_code: "31101",
    },
    {
      name: "Keya Paha",
      fips_code: "31103",
    },
    {
      name: "Kimball",
      fips_code: "31105",
    },
    {
      name: "Knox",
      fips_code: "31107",
    },
    {
      name: "Lancaster",
      fips_code: "31109",
    },
    {
      name: "Lincoln",
      fips_code: "31111",
    },
    {
      name: "Logan",
      fips_code: "31113",
    },
    {
      name: "Loup",
      fips_code: "31115",
    },
    {
      name: "Madison",
      fips_code: "31119",
    },
    {
      name: "McPherson",
      fips_code: "31117",
    },
    {
      name: "Merrick",
      fips_code: "31121",
    },
    {
      name: "Morrill",
      fips_code: "31123",
    },
    {
      name: "Nance",
      fips_code: "31125",
    },
    {
      name: "Nemaha",
      fips_code: "31127",
    },
    {
      name: "Nuckolls",
      fips_code: "31129",
    },
    {
      name: "Otoe",
      fips_code: "31131",
    },
    {
      name: "Pawnee",
      fips_code: "31133",
    },
    {
      name: "Perkins",
      fips_code: "31135",
    },
    {
      name: "Phelps",
      fips_code: "31137",
    },
    {
      name: "Pierce",
      fips_code: "31139",
    },
    {
      name: "Platte",
      fips_code: "31141",
    },
    {
      name: "Polk",
      fips_code: "31143",
    },
    {
      name: "Red Willow",
      fips_code: "31145",
    },
    {
      name: "Richardson",
      fips_code: "31147",
    },
    {
      name: "Rock",
      fips_code: "31149",
    },
    {
      name: "Saline",
      fips_code: "31151",
    },
    {
      name: "Sarpy",
      fips_code: "31153",
    },
    {
      name: "Saunders",
      fips_code: "31155",
    },
    {
      name: "Scotts Bluff",
      fips_code: "31157",
    },
    {
      name: "Seward",
      fips_code: "31159",
    },
    {
      name: "Sheridan",
      fips_code: "31161",
    },
    {
      name: "Sherman",
      fips_code: "31163",
    },
    {
      name: "Sioux",
      fips_code: "31165",
    },
    {
      name: "Stanton",
      fips_code: "31167",
    },
    {
      name: "Thayer",
      fips_code: "31169",
    },
    {
      name: "Thomas",
      fips_code: "31171",
    },
    {
      name: "Thurston",
      fips_code: "31173",
    },
    {
      name: "Valley",
      fips_code: "31175",
    },
    {
      name: "Washington",
      fips_code: "31177",
    },
    {
      name: "Wayne",
      fips_code: "31179",
    },
    {
      name: "Webster",
      fips_code: "31181",
    },
    {
      name: "Wheeler",
      fips_code: "31183",
    },
    {
      name: "York",
      fips_code: "31185",
    },
  ],
  NV: [
    {
      name: "Carson City",
      fips_code: "32510",
    },
    {
      name: "Churchill",
      fips_code: "32001",
    },
    {
      name: "Clark",
      fips_code: "32003",
    },
    {
      name: "Douglas",
      fips_code: "32005",
    },
    {
      name: "Elko",
      fips_code: "32007",
    },
    {
      name: "Esmeralda",
      fips_code: "32009",
    },
    {
      name: "Eureka",
      fips_code: "32011",
    },
    {
      name: "Humboldt",
      fips_code: "32013",
    },
    {
      name: "Lander",
      fips_code: "32015",
    },
    {
      name: "Lincoln",
      fips_code: "32017",
    },
    {
      name: "Lyon",
      fips_code: "32019",
    },
    {
      name: "Mineral",
      fips_code: "32021",
    },
    {
      name: "Nye",
      fips_code: "32023",
    },
    {
      name: "Pershing",
      fips_code: "32027",
    },
    {
      name: "Storey",
      fips_code: "32029",
    },
    {
      name: "Washoe",
      fips_code: "32031",
    },
    {
      name: "White Pine",
      fips_code: "32033",
    },
  ],
  NH: [
    {
      name: "Belknap",
      fips_code: "33001",
    },
    {
      name: "Carroll",
      fips_code: "33003",
    },
    {
      name: "Cheshire",
      fips_code: "33005",
    },
    {
      name: "Coos",
      fips_code: "33007",
    },
    {
      name: "Grafton",
      fips_code: "33009",
    },
    {
      name: "Hillsborough",
      fips_code: "33011",
    },
    {
      name: "Merrimack",
      fips_code: "33013",
    },
    {
      name: "Rockingham",
      fips_code: "33015",
    },
    {
      name: "Strafford",
      fips_code: "33017",
    },
    {
      name: "Sullivan",
      fips_code: "33019",
    },
  ],
  NJ: [
    {
      name: "Atlantic",
      fips_code: "34001",
    },
    {
      name: "Bergen",
      fips_code: "34003",
    },
    {
      name: "Burlington",
      fips_code: "34005",
    },
    {
      name: "Camden",
      fips_code: "34007",
    },
    {
      name: "Cape May",
      fips_code: "34009",
    },
    {
      name: "Cumberland",
      fips_code: "34011",
    },
    {
      name: "Essex",
      fips_code: "34013",
    },
    {
      name: "Gloucester",
      fips_code: "34015",
    },
    {
      name: "Hudson",
      fips_code: "34017",
    },
    {
      name: "Hunterdon",
      fips_code: "34019",
    },
    {
      name: "Mercer",
      fips_code: "34021",
    },
    {
      name: "Middlesex",
      fips_code: "34023",
    },
    {
      name: "Monmouth",
      fips_code: "34025",
    },
    {
      name: "Morris",
      fips_code: "34027",
    },
    {
      name: "Ocean",
      fips_code: "34029",
    },
    {
      name: "Passaic",
      fips_code: "34031",
    },
    {
      name: "Salem",
      fips_code: "34033",
    },
    {
      name: "Somerset",
      fips_code: "34035",
    },
    {
      name: "Sussex",
      fips_code: "34037",
    },
    {
      name: "Union",
      fips_code: "34039",
    },
    {
      name: "Warren",
      fips_code: "34041",
    },
  ],
  NM: [
    {
      name: "Bernalillo",
      fips_code: "35001",
    },
    {
      name: "Catron",
      fips_code: "35003",
    },
    {
      name: "Chaves",
      fips_code: "35005",
    },
    {
      name: "Cibola",
      fips_code: "35006",
    },
    {
      name: "Colfax",
      fips_code: "35007",
    },
    {
      name: "Curry",
      fips_code: "35009",
    },
    {
      name: "DeBaca",
      fips_code: "35011",
    },
    {
      name: "Dona Ana",
      fips_code: "35013",
    },
    {
      name: "Eddy",
      fips_code: "35015",
    },
    {
      name: "Grant",
      fips_code: "35017",
    },
    {
      name: "Guadalupe",
      fips_code: "35019",
    },
    {
      name: "Harding",
      fips_code: "35021",
    },
    {
      name: "Hidalgo",
      fips_code: "35023",
    },
    {
      name: "Lea",
      fips_code: "35025",
    },
    {
      name: "Lincoln",
      fips_code: "35027",
    },
    {
      name: "Los Alamos",
      fips_code: "35028",
    },
    {
      name: "Luna",
      fips_code: "35029",
    },
    {
      name: "McKinley",
      fips_code: "35031",
    },
    {
      name: "Mora",
      fips_code: "35033",
    },
    {
      name: "Otero",
      fips_code: "35035",
    },
    {
      name: "Quay",
      fips_code: "35037",
    },
    {
      name: "Rio Arriba",
      fips_code: "35039",
    },
    {
      name: "Roosevelt",
      fips_code: "35041",
    },
    {
      name: "San Juan",
      fips_code: "35045",
    },
    {
      name: "San Miguel",
      fips_code: "35047",
    },
    {
      name: "Sandoval",
      fips_code: "35043",
    },
    {
      name: "Santa Fe",
      fips_code: "35049",
    },
    {
      name: "Sierra",
      fips_code: "35051",
    },
    {
      name: "Socorro",
      fips_code: "35053",
    },
    {
      name: "Taos",
      fips_code: "35055",
    },
    {
      name: "Torrance",
      fips_code: "35057",
    },
    {
      name: "Union",
      fips_code: "35059",
    },
    {
      name: "Valencia",
      fips_code: "35061",
    },
  ],
  NY: [
    {
      name: "Albany",
      fips_code: "36001",
    },
    {
      name: "Allegany",
      fips_code: "36003",
    },
    {
      name: "Bronx",
      fips_code: "36005",
    },
    {
      name: "Broome",
      fips_code: "36007",
    },
    {
      name: "Cattaraugus",
      fips_code: "36009",
    },
    {
      name: "Cayuga",
      fips_code: "36011",
    },
    {
      name: "Chautauqua",
      fips_code: "36013",
    },
    {
      name: "Chemung",
      fips_code: "36015",
    },
    {
      name: "Chenango",
      fips_code: "36017",
    },
    {
      name: "Clinton",
      fips_code: "36019",
    },
    {
      name: "Columbia",
      fips_code: "36021",
    },
    {
      name: "Cortland",
      fips_code: "36023",
    },
    {
      name: "Delaware",
      fips_code: "36025",
    },
    {
      name: "Dutchess",
      fips_code: "36027",
    },
    {
      name: "Erie",
      fips_code: "36029",
    },
    {
      name: "Essex",
      fips_code: "36031",
    },
    {
      name: "Franklin",
      fips_code: "36033",
    },
    {
      name: "Fulton",
      fips_code: "36035",
    },
    {
      name: "Genesee",
      fips_code: "36037",
    },
    {
      name: "Greene",
      fips_code: "36039",
    },
    {
      name: "Hamilton",
      fips_code: "36041",
    },
    {
      name: "Herkimer",
      fips_code: "36043",
    },
    {
      name: "Jefferson",
      fips_code: "36045",
    },
    {
      name: "Kings",
      fips_code: "36047",
    },
    {
      name: "Lewis",
      fips_code: "36049",
    },
    {
      name: "Livingston",
      fips_code: "36051",
    },
    {
      name: "Madison",
      fips_code: "36053",
    },
    {
      name: "Monroe",
      fips_code: "36055",
    },
    {
      name: "Montgomery",
      fips_code: "36057",
    },
    {
      name: "Nassau",
      fips_code: "36059",
    },
    {
      name: "New York",
      fips_code: "36061",
    },
    {
      name: "Niagara",
      fips_code: "36063",
    },
    {
      name: "Oneida",
      fips_code: "36065",
    },
    {
      name: "Onondaga",
      fips_code: "36067",
    },
    {
      name: "Ontario",
      fips_code: "36069",
    },
    {
      name: "Orange",
      fips_code: "36071",
    },
    {
      name: "Orleans",
      fips_code: "36073",
    },
    {
      name: "Oswego",
      fips_code: "36075",
    },
    {
      name: "Otsego",
      fips_code: "36077",
    },
    {
      name: "Putnam",
      fips_code: "36079",
    },
    {
      name: "Queens",
      fips_code: "36081",
    },
    {
      name: "Rensselaer",
      fips_code: "36083",
    },
    {
      name: "Richmond",
      fips_code: "36085",
    },
    {
      name: "Rockland",
      fips_code: "36087",
    },
    {
      name: "Saratoga",
      fips_code: "36091",
    },
    {
      name: "Schenectady",
      fips_code: "36093",
    },
    {
      name: "Schoharie",
      fips_code: "36095",
    },
    {
      name: "Schuyler",
      fips_code: "36097",
    },
    {
      name: "Seneca",
      fips_code: "36099",
    },
    {
      name: "St. Lawrence",
      fips_code: "36089",
    },
    {
      name: "Steuben",
      fips_code: "36101",
    },
    {
      name: "Suffolk",
      fips_code: "36103",
    },
    {
      name: "Sullivan",
      fips_code: "36105",
    },
    {
      name: "Tioga",
      fips_code: "36107",
    },
    {
      name: "Tompkins",
      fips_code: "36109",
    },
    {
      name: "Ulster",
      fips_code: "36111",
    },
    {
      name: "Warren",
      fips_code: "36113",
    },
    {
      name: "Washington",
      fips_code: "36115",
    },
    {
      name: "Wayne",
      fips_code: "36117",
    },
    {
      name: "Westchester",
      fips_code: "36119",
    },
    {
      name: "Wyoming",
      fips_code: "36121",
    },
    {
      name: "Yates",
      fips_code: "36123",
    },
  ],
  NC: [
    {
      name: "Alamance",
      fips_code: "37001",
    },
    {
      name: "Alexander",
      fips_code: "37003",
    },
    {
      name: "Alleghany",
      fips_code: "37005",
    },
    {
      name: "Anson",
      fips_code: "37007",
    },
    {
      name: "Ashe",
      fips_code: "37009",
    },
    {
      name: "Avery",
      fips_code: "37011",
    },
    {
      name: "Beaufort",
      fips_code: "37013",
    },
    {
      name: "Bertie",
      fips_code: "37015",
    },
    {
      name: "Bladen",
      fips_code: "37017",
    },
    {
      name: "Brunswick",
      fips_code: "37019",
    },
    {
      name: "Buncombe",
      fips_code: "37021",
    },
    {
      name: "Burke",
      fips_code: "37023",
    },
    {
      name: "Cabarrus",
      fips_code: "37025",
    },
    {
      name: "Caldwell",
      fips_code: "37027",
    },
    {
      name: "Camden",
      fips_code: "37029",
    },
    {
      name: "Carteret",
      fips_code: "37031",
    },
    {
      name: "Caswell",
      fips_code: "37033",
    },
    {
      name: "Catawba",
      fips_code: "37035",
    },
    {
      name: "Chatham",
      fips_code: "37037",
    },
    {
      name: "Cherokee",
      fips_code: "37039",
    },
    {
      name: "Chowan",
      fips_code: "37041",
    },
    {
      name: "Clay",
      fips_code: "37043",
    },
    {
      name: "Cleveland",
      fips_code: "37045",
    },
    {
      name: "Columbus",
      fips_code: "37047",
    },
    {
      name: "Craven",
      fips_code: "37049",
    },
    {
      name: "Cumberland",
      fips_code: "37051",
    },
    {
      name: "Currituck",
      fips_code: "37053",
    },
    {
      name: "Dare",
      fips_code: "37055",
    },
    {
      name: "Davidson",
      fips_code: "37057",
    },
    {
      name: "Davie",
      fips_code: "37059",
    },
    {
      name: "Duplin",
      fips_code: "37061",
    },
    {
      name: "Durham",
      fips_code: "37063",
    },
    {
      name: "Edgecombe",
      fips_code: "37065",
    },
    {
      name: "Forsyth",
      fips_code: "37067",
    },
    {
      name: "Franklin",
      fips_code: "37069",
    },
    {
      name: "Gaston",
      fips_code: "37071",
    },
    {
      name: "Gates",
      fips_code: "37073",
    },
    {
      name: "Graham",
      fips_code: "37075",
    },
    {
      name: "Granville",
      fips_code: "37077",
    },
    {
      name: "Greene",
      fips_code: "37079",
    },
    {
      name: "Guilford",
      fips_code: "37081",
    },
    {
      name: "Halifax",
      fips_code: "37083",
    },
    {
      name: "Harnett",
      fips_code: "37085",
    },
    {
      name: "Haywood",
      fips_code: "37087",
    },
    {
      name: "Henderson",
      fips_code: "37089",
    },
    {
      name: "Hertford",
      fips_code: "37091",
    },
    {
      name: "Hoke",
      fips_code: "37093",
    },
    {
      name: "Hyde",
      fips_code: "37095",
    },
    {
      name: "Iredell",
      fips_code: "37097",
    },
    {
      name: "Jackson",
      fips_code: "37099",
    },
    {
      name: "Johnston",
      fips_code: "37101",
    },
    {
      name: "Jones",
      fips_code: "37103",
    },
    {
      name: "Lee",
      fips_code: "37105",
    },
    {
      name: "Lenoir",
      fips_code: "37107",
    },
    {
      name: "Lincoln",
      fips_code: "37109",
    },
    {
      name: "Macon",
      fips_code: "37113",
    },
    {
      name: "Madison",
      fips_code: "37115",
    },
    {
      name: "Martin",
      fips_code: "37117",
    },
    {
      name: "McDowell",
      fips_code: "37111",
    },
    {
      name: "Mecklenburg",
      fips_code: "37119",
    },
    {
      name: "Mitchell",
      fips_code: "37121",
    },
    {
      name: "Montgomery",
      fips_code: "37123",
    },
    {
      name: "Moore",
      fips_code: "37125",
    },
    {
      name: "Nash",
      fips_code: "37127",
    },
    {
      name: "New Hanover",
      fips_code: "37129",
    },
    {
      name: "Northampton",
      fips_code: "37131",
    },
    {
      name: "Onslow",
      fips_code: "37133",
    },
    {
      name: "Orange",
      fips_code: "37135",
    },
    {
      name: "Pamlico",
      fips_code: "37137",
    },
    {
      name: "Pasquotank",
      fips_code: "37139",
    },
    {
      name: "Pender",
      fips_code: "37141",
    },
    {
      name: "Perquimans",
      fips_code: "37143",
    },
    {
      name: "Person",
      fips_code: "37145",
    },
    {
      name: "Pitt",
      fips_code: "37147",
    },
    {
      name: "Polk",
      fips_code: "37149",
    },
    {
      name: "Randolph",
      fips_code: "37151",
    },
    {
      name: "Richmond",
      fips_code: "37153",
    },
    {
      name: "Robeson",
      fips_code: "37155",
    },
    {
      name: "Rockingham",
      fips_code: "37157",
    },
    {
      name: "Rowan",
      fips_code: "37159",
    },
    {
      name: "Rutherford",
      fips_code: "37161",
    },
    {
      name: "Sampson",
      fips_code: "37163",
    },
    {
      name: "Scotland",
      fips_code: "37165",
    },
    {
      name: "Stanly",
      fips_code: "37167",
    },
    {
      name: "Stokes",
      fips_code: "37169",
    },
    {
      name: "Surry",
      fips_code: "37171",
    },
    {
      name: "Swain",
      fips_code: "37173",
    },
    {
      name: "Transylvania",
      fips_code: "37175",
    },
    {
      name: "Tyrrell",
      fips_code: "37177",
    },
    {
      name: "Union",
      fips_code: "37179",
    },
    {
      name: "Vance",
      fips_code: "37181",
    },
    {
      name: "Wake",
      fips_code: "37183",
    },
    {
      name: "Warren",
      fips_code: "37185",
    },
    {
      name: "Washington",
      fips_code: "37187",
    },
    {
      name: "Watauga",
      fips_code: "37189",
    },
    {
      name: "Wayne",
      fips_code: "37191",
    },
    {
      name: "Wilkes",
      fips_code: "37193",
    },
    {
      name: "Wilson",
      fips_code: "37195",
    },
    {
      name: "Yadkin",
      fips_code: "37197",
    },
    {
      name: "Yancey",
      fips_code: "37199",
    },
  ],
  ND: [
    {
      name: "Adams",
      fips_code: "38001",
    },
    {
      name: "Barnes",
      fips_code: "38003",
    },
    {
      name: "Benson",
      fips_code: "38005",
    },
    {
      name: "Billings",
      fips_code: "38007",
    },
    {
      name: "Bottineau",
      fips_code: "38009",
    },
    {
      name: "Bowman",
      fips_code: "38011",
    },
    {
      name: "Burke",
      fips_code: "38013",
    },
    {
      name: "Burleigh",
      fips_code: "38015",
    },
    {
      name: "Cass",
      fips_code: "38017",
    },
    {
      name: "Cavalier",
      fips_code: "38019",
    },
    {
      name: "Dickey",
      fips_code: "38021",
    },
    {
      name: "Divide",
      fips_code: "38023",
    },
    {
      name: "Dunn",
      fips_code: "38025",
    },
    {
      name: "Eddy",
      fips_code: "38027",
    },
    {
      name: "Emmons",
      fips_code: "38029",
    },
    {
      name: "Foster",
      fips_code: "38031",
    },
    {
      name: "Golden Valley",
      fips_code: "38033",
    },
    {
      name: "Grand Forks",
      fips_code: "38035",
    },
    {
      name: "Grant",
      fips_code: "38037",
    },
    {
      name: "Griggs",
      fips_code: "38039",
    },
    {
      name: "Hettinger",
      fips_code: "38041",
    },
    {
      name: "Kidder",
      fips_code: "38043",
    },
    {
      name: "LaMoure",
      fips_code: "38045",
    },
    {
      name: "Logan",
      fips_code: "38047",
    },
    {
      name: "McHenry",
      fips_code: "38049",
    },
    {
      name: "McIntosh",
      fips_code: "38051",
    },
    {
      name: "McKenzie",
      fips_code: "38053",
    },
    {
      name: "McLean",
      fips_code: "38055",
    },
    {
      name: "Mercer",
      fips_code: "38057",
    },
    {
      name: "Morton",
      fips_code: "38059",
    },
    {
      name: "Mountrail",
      fips_code: "38061",
    },
    {
      name: "Nelson",
      fips_code: "38063",
    },
    {
      name: "Oliver",
      fips_code: "38065",
    },
    {
      name: "Pembina",
      fips_code: "38067",
    },
    {
      name: "Pierce",
      fips_code: "38069",
    },
    {
      name: "Ramsey",
      fips_code: "38071",
    },
    {
      name: "Ransom",
      fips_code: "38073",
    },
    {
      name: "Renville",
      fips_code: "38075",
    },
    {
      name: "Richland",
      fips_code: "38077",
    },
    {
      name: "Rolette",
      fips_code: "38079",
    },
    {
      name: "Sargent",
      fips_code: "38081",
    },
    {
      name: "Sheridan",
      fips_code: "38083",
    },
    {
      name: "Sioux",
      fips_code: "38085",
    },
    {
      name: "Slope",
      fips_code: "38087",
    },
    {
      name: "Stark",
      fips_code: "38089",
    },
    {
      name: "Steele",
      fips_code: "38091",
    },
    {
      name: "Stutsman",
      fips_code: "38093",
    },
    {
      name: "Towner",
      fips_code: "38095",
    },
    {
      name: "Traill",
      fips_code: "38097",
    },
    {
      name: "Walsh",
      fips_code: "38099",
    },
    {
      name: "Ward",
      fips_code: "38101",
    },
    {
      name: "Wells",
      fips_code: "38103",
    },
    {
      name: "Williams",
      fips_code: "38105",
    },
  ],
  OH: [
    {
      name: "Adams",
      fips_code: "39001",
    },
    {
      name: "Allen",
      fips_code: "39003",
    },
    {
      name: "Ashland",
      fips_code: "39005",
    },
    {
      name: "Ashtabula",
      fips_code: "39007",
    },
    {
      name: "Athens",
      fips_code: "39009",
    },
    {
      name: "Auglaize",
      fips_code: "39011",
    },
    {
      name: "Belmont",
      fips_code: "39013",
    },
    {
      name: "Brown",
      fips_code: "39015",
    },
    {
      name: "Butler",
      fips_code: "39017",
    },
    {
      name: "Carroll",
      fips_code: "39019",
    },
    {
      name: "Champaign",
      fips_code: "39021",
    },
    {
      name: "Clark",
      fips_code: "39023",
    },
    {
      name: "Clermont",
      fips_code: "39025",
    },
    {
      name: "Clinton",
      fips_code: "39027",
    },
    {
      name: "Columbiana",
      fips_code: "39029",
    },
    {
      name: "Coshocton",
      fips_code: "39031",
    },
    {
      name: "Crawford",
      fips_code: "39033",
    },
    {
      name: "Cuyahoga",
      fips_code: "39035",
    },
    {
      name: "Darke",
      fips_code: "39037",
    },
    {
      name: "Defiance",
      fips_code: "39039",
    },
    {
      name: "Delaware",
      fips_code: "39041",
    },
    {
      name: "Erie",
      fips_code: "39043",
    },
    {
      name: "Fairfield",
      fips_code: "39045",
    },
    {
      name: "Fayette",
      fips_code: "39047",
    },
    {
      name: "Franklin",
      fips_code: "39049",
    },
    {
      name: "Fulton",
      fips_code: "39051",
    },
    {
      name: "Gallia",
      fips_code: "39053",
    },
    {
      name: "Geauga",
      fips_code: "39055",
    },
    {
      name: "Greene",
      fips_code: "39057",
    },
    {
      name: "Guernsey",
      fips_code: "39059",
    },
    {
      name: "Hamilton",
      fips_code: "39061",
    },
    {
      name: "Hancock",
      fips_code: "39063",
    },
    {
      name: "Hardin",
      fips_code: "39065",
    },
    {
      name: "Harrison",
      fips_code: "39067",
    },
    {
      name: "Henry",
      fips_code: "39069",
    },
    {
      name: "Highland",
      fips_code: "39071",
    },
    {
      name: "Hocking",
      fips_code: "39073",
    },
    {
      name: "Holmes",
      fips_code: "39075",
    },
    {
      name: "Huron",
      fips_code: "39077",
    },
    {
      name: "Jackson",
      fips_code: "39079",
    },
    {
      name: "Jefferson",
      fips_code: "39081",
    },
    {
      name: "Knox",
      fips_code: "39083",
    },
    {
      name: "Lake",
      fips_code: "39085",
    },
    {
      name: "Lawrence",
      fips_code: "39087",
    },
    {
      name: "Licking",
      fips_code: "39089",
    },
    {
      name: "Logan",
      fips_code: "39091",
    },
    {
      name: "Lorain",
      fips_code: "39093",
    },
    {
      name: "Lucas",
      fips_code: "39095",
    },
    {
      name: "Madison",
      fips_code: "39097",
    },
    {
      name: "Mahoning",
      fips_code: "39099",
    },
    {
      name: "Marion",
      fips_code: "39101",
    },
    {
      name: "Medina",
      fips_code: "39103",
    },
    {
      name: "Meigs",
      fips_code: "39105",
    },
    {
      name: "Mercer",
      fips_code: "39107",
    },
    {
      name: "Miami",
      fips_code: "39109",
    },
    {
      name: "Monroe",
      fips_code: "39111",
    },
    {
      name: "Montgomery",
      fips_code: "39113",
    },
    {
      name: "Morgan",
      fips_code: "39115",
    },
    {
      name: "Morrow",
      fips_code: "39117",
    },
    {
      name: "Muskingum",
      fips_code: "39119",
    },
    {
      name: "Noble",
      fips_code: "39121",
    },
    {
      name: "Ottawa",
      fips_code: "39123",
    },
    {
      name: "Paulding",
      fips_code: "39125",
    },
    {
      name: "Perry",
      fips_code: "39127",
    },
    {
      name: "Pickaway",
      fips_code: "39129",
    },
    {
      name: "Pike",
      fips_code: "39131",
    },
    {
      name: "Portage",
      fips_code: "39133",
    },
    {
      name: "Preble",
      fips_code: "39135",
    },
    {
      name: "Putnam",
      fips_code: "39137",
    },
    {
      name: "Richland",
      fips_code: "39139",
    },
    {
      name: "Ross",
      fips_code: "39141",
    },
    {
      name: "Sandusky",
      fips_code: "39143",
    },
    {
      name: "Scioto",
      fips_code: "39145",
    },
    {
      name: "Seneca",
      fips_code: "39147",
    },
    {
      name: "Shelby",
      fips_code: "39149",
    },
    {
      name: "Stark",
      fips_code: "39151",
    },
    {
      name: "Summit",
      fips_code: "39153",
    },
    {
      name: "Trumbull",
      fips_code: "39155",
    },
    {
      name: "Tuscarawas",
      fips_code: "39157",
    },
    {
      name: "Union",
      fips_code: "39159",
    },
    {
      name: "Van Wert",
      fips_code: "39161",
    },
    {
      name: "Vinton",
      fips_code: "39163",
    },
    {
      name: "Warren",
      fips_code: "39165",
    },
    {
      name: "Washington",
      fips_code: "39167",
    },
    {
      name: "Wayne",
      fips_code: "39169",
    },
    {
      name: "Williams",
      fips_code: "39171",
    },
    {
      name: "Wood",
      fips_code: "39173",
    },
    {
      name: "Wyandot",
      fips_code: "39175",
    },
  ],
  OK: [
    {
      name: "Adair",
      fips_code: "40001",
    },
    {
      name: "Alfalfa",
      fips_code: "40003",
    },
    {
      name: "Atoka",
      fips_code: "40005",
    },
    {
      name: "Beaver",
      fips_code: "40007",
    },
    {
      name: "Beckham",
      fips_code: "40009",
    },
    {
      name: "Blaine",
      fips_code: "40011",
    },
    {
      name: "Bryan",
      fips_code: "40013",
    },
    {
      name: "Caddo",
      fips_code: "40015",
    },
    {
      name: "Canadian",
      fips_code: "40017",
    },
    {
      name: "Carter",
      fips_code: "40019",
    },
    {
      name: "Cherokee",
      fips_code: "40021",
    },
    {
      name: "Choctaw",
      fips_code: "40023",
    },
    {
      name: "Cimarron",
      fips_code: "40025",
    },
    {
      name: "Cleveland",
      fips_code: "40027",
    },
    {
      name: "Coal",
      fips_code: "40029",
    },
    {
      name: "Comanche",
      fips_code: "40031",
    },
    {
      name: "Cotton",
      fips_code: "40033",
    },
    {
      name: "Craig",
      fips_code: "40035",
    },
    {
      name: "Creek",
      fips_code: "40037",
    },
    {
      name: "Custer",
      fips_code: "40039",
    },
    {
      name: "Delaware",
      fips_code: "40041",
    },
    {
      name: "Dewey",
      fips_code: "40043",
    },
    {
      name: "Ellis",
      fips_code: "40045",
    },
    {
      name: "Garfield",
      fips_code: "40047",
    },
    {
      name: "Garvin",
      fips_code: "40049",
    },
    {
      name: "Grady",
      fips_code: "40051",
    },
    {
      name: "Grant",
      fips_code: "40053",
    },
    {
      name: "Greer",
      fips_code: "40055",
    },
    {
      name: "Harmon",
      fips_code: "40057",
    },
    {
      name: "Harper",
      fips_code: "40059",
    },
    {
      name: "Haskell",
      fips_code: "40061",
    },
    {
      name: "Hughes",
      fips_code: "40063",
    },
    {
      name: "Jackson",
      fips_code: "40065",
    },
    {
      name: "Jefferson",
      fips_code: "40067",
    },
    {
      name: "Johnston",
      fips_code: "40069",
    },
    {
      name: "Kay",
      fips_code: "40071",
    },
    {
      name: "Kingfisher",
      fips_code: "40073",
    },
    {
      name: "Kiowa",
      fips_code: "40075",
    },
    {
      name: "Latimer",
      fips_code: "40077",
    },
    {
      name: "Le Flore",
      fips_code: "40079",
    },
    {
      name: "Lincoln",
      fips_code: "40081",
    },
    {
      name: "Logan",
      fips_code: "40083",
    },
    {
      name: "Love",
      fips_code: "40085",
    },
    {
      name: "Major",
      fips_code: "40093",
    },
    {
      name: "Marshall",
      fips_code: "40095",
    },
    {
      name: "Mayes",
      fips_code: "40097",
    },
    {
      name: "McClain",
      fips_code: "40087",
    },
    {
      name: "McCurtain",
      fips_code: "40089",
    },
    {
      name: "McIntosh",
      fips_code: "40091",
    },
    {
      name: "Murray",
      fips_code: "40099",
    },
    {
      name: "Muskogee",
      fips_code: "40101",
    },
    {
      name: "Noble",
      fips_code: "40103",
    },
    {
      name: "Nowata",
      fips_code: "40105",
    },
    {
      name: "Okfuskee",
      fips_code: "40107",
    },
    {
      name: "Oklahoma",
      fips_code: "40109",
    },
    {
      name: "Okmulgee",
      fips_code: "40111",
    },
    {
      name: "Osage",
      fips_code: "40113",
    },
    {
      name: "Ottawa",
      fips_code: "40115",
    },
    {
      name: "Pawnee",
      fips_code: "40117",
    },
    {
      name: "Payne",
      fips_code: "40119",
    },
    {
      name: "Pittsburg",
      fips_code: "40121",
    },
    {
      name: "Pontotoc",
      fips_code: "40123",
    },
    {
      name: "Pottawatomie",
      fips_code: "40125",
    },
    {
      name: "Pushmataha",
      fips_code: "40127",
    },
    {
      name: "Roger Mills",
      fips_code: "40129",
    },
    {
      name: "Rogers",
      fips_code: "40131",
    },
    {
      name: "Seminole",
      fips_code: "40133",
    },
    {
      name: "Sequoyah",
      fips_code: "40135",
    },
    {
      name: "Stephens",
      fips_code: "40137",
    },
    {
      name: "Texas",
      fips_code: "40139",
    },
    {
      name: "Tillman",
      fips_code: "40141",
    },
    {
      name: "Tulsa",
      fips_code: "40143",
    },
    {
      name: "Wagoner",
      fips_code: "40145",
    },
    {
      name: "Washington",
      fips_code: "40147",
    },
    {
      name: "Washita",
      fips_code: "40149",
    },
    {
      name: "Woods",
      fips_code: "40151",
    },
    {
      name: "Woodward",
      fips_code: "40153",
    },
  ],
  OR: [
    {
      name: "Baker",
      fips_code: "41001",
    },
    {
      name: "Benton",
      fips_code: "41003",
    },
    {
      name: "Clackamas",
      fips_code: "41005",
    },
    {
      name: "Clatsop",
      fips_code: "41007",
    },
    {
      name: "Columbia",
      fips_code: "41009",
    },
    {
      name: "Coos",
      fips_code: "41011",
    },
    {
      name: "Crook",
      fips_code: "41013",
    },
    {
      name: "Curry",
      fips_code: "41015",
    },
    {
      name: "Deschutes",
      fips_code: "41017",
    },
    {
      name: "Douglas",
      fips_code: "41019",
    },
    {
      name: "Gilliam",
      fips_code: "41021",
    },
    {
      name: "Grant",
      fips_code: "41023",
    },
    {
      name: "Harney",
      fips_code: "41025",
    },
    {
      name: "Hood River",
      fips_code: "41027",
    },
    {
      name: "Jackson",
      fips_code: "41029",
    },
    {
      name: "Jefferson",
      fips_code: "41031",
    },
    {
      name: "Josephine",
      fips_code: "41033",
    },
    {
      name: "Klamath",
      fips_code: "41035",
    },
    {
      name: "Lake",
      fips_code: "41037",
    },
    {
      name: "Lane",
      fips_code: "41039",
    },
    {
      name: "Lincoln",
      fips_code: "41041",
    },
    {
      name: "Linn",
      fips_code: "41043",
    },
    {
      name: "Malheur",
      fips_code: "41045",
    },
    {
      name: "Marion",
      fips_code: "41047",
    },
    {
      name: "Morrow",
      fips_code: "41049",
    },
    {
      name: "Multnomah",
      fips_code: "41051",
    },
    {
      name: "Polk",
      fips_code: "41053",
    },
    {
      name: "Sherman",
      fips_code: "41055",
    },
    {
      name: "Tillamook",
      fips_code: "41057",
    },
    {
      name: "Umatilla",
      fips_code: "41059",
    },
    {
      name: "Union",
      fips_code: "41061",
    },
    {
      name: "Wallowa",
      fips_code: "41063",
    },
    {
      name: "Wasco",
      fips_code: "41065",
    },
    {
      name: "Washington",
      fips_code: "41067",
    },
    {
      name: "Wheeler",
      fips_code: "41069",
    },
    {
      name: "Yamhill",
      fips_code: "41071",
    },
  ],
  PA: [
    {
      name: "Adams",
      fips_code: "42001",
    },
    {
      name: "Allegheny",
      fips_code: "42003",
    },
    {
      name: "Armstrong",
      fips_code: "42005",
    },
    {
      name: "Beaver",
      fips_code: "42007",
    },
    {
      name: "Bedford",
      fips_code: "42009",
    },
    {
      name: "Berks",
      fips_code: "42011",
    },
    {
      name: "Blair",
      fips_code: "42013",
    },
    {
      name: "Bradford",
      fips_code: "42015",
    },
    {
      name: "Bucks",
      fips_code: "42017",
    },
    {
      name: "Butler",
      fips_code: "42019",
    },
    {
      name: "Cambria",
      fips_code: "42021",
    },
    {
      name: "Cameron",
      fips_code: "42023",
    },
    {
      name: "Carbon",
      fips_code: "42025",
    },
    {
      name: "Centre",
      fips_code: "42027",
    },
    {
      name: "Chester",
      fips_code: "42029",
    },
    {
      name: "Clarion",
      fips_code: "42031",
    },
    {
      name: "Clearfield",
      fips_code: "42033",
    },
    {
      name: "Clinton",
      fips_code: "42035",
    },
    {
      name: "Columbia",
      fips_code: "42037",
    },
    {
      name: "Crawford",
      fips_code: "42039",
    },
    {
      name: "Cumberland",
      fips_code: "42041",
    },
    {
      name: "Dauphin",
      fips_code: "42043",
    },
    {
      name: "Delaware",
      fips_code: "42045",
    },
    {
      name: "Elk",
      fips_code: "42047",
    },
    {
      name: "Erie",
      fips_code: "42049",
    },
    {
      name: "Fayette",
      fips_code: "42051",
    },
    {
      name: "Forest",
      fips_code: "42053",
    },
    {
      name: "Franklin",
      fips_code: "42055",
    },
    {
      name: "Fulton",
      fips_code: "42057",
    },
    {
      name: "Greene",
      fips_code: "42059",
    },
    {
      name: "Huntingdon",
      fips_code: "42061",
    },
    {
      name: "Indiana",
      fips_code: "42063",
    },
    {
      name: "Jefferson",
      fips_code: "42065",
    },
    {
      name: "Juniata",
      fips_code: "42067",
    },
    {
      name: "Lackawanna",
      fips_code: "42069",
    },
    {
      name: "Lancaster",
      fips_code: "42071",
    },
    {
      name: "Lawrence",
      fips_code: "42073",
    },
    {
      name: "Lebanon",
      fips_code: "42075",
    },
    {
      name: "Lehigh",
      fips_code: "42077",
    },
    {
      name: "Luzerne",
      fips_code: "42079",
    },
    {
      name: "Lycoming",
      fips_code: "42081",
    },
    {
      name: "Mc Kean",
      fips_code: "42083",
    },
    {
      name: "Mercer",
      fips_code: "42085",
    },
    {
      name: "Mifflin",
      fips_code: "42087",
    },
    {
      name: "Monroe",
      fips_code: "42089",
    },
    {
      name: "Montgomery",
      fips_code: "42091",
    },
    {
      name: "Montour",
      fips_code: "42093",
    },
    {
      name: "Northampton",
      fips_code: "42095",
    },
    {
      name: "Northumberland",
      fips_code: "42097",
    },
    {
      name: "Perry",
      fips_code: "42099",
    },
    {
      name: "Philadelphia",
      fips_code: "42101",
    },
    {
      name: "Pike",
      fips_code: "42103",
    },
    {
      name: "Potter",
      fips_code: "42105",
    },
    {
      name: "Schuylkill",
      fips_code: "42107",
    },
    {
      name: "Snyder",
      fips_code: "42109",
    },
    {
      name: "Somerset",
      fips_code: "42111",
    },
    {
      name: "Sullivan",
      fips_code: "42113",
    },
    {
      name: "Susquehanna",
      fips_code: "42115",
    },
    {
      name: "Tioga",
      fips_code: "42117",
    },
    {
      name: "Union",
      fips_code: "42119",
    },
    {
      name: "Venango",
      fips_code: "42121",
    },
    {
      name: "Warren",
      fips_code: "42123",
    },
    {
      name: "Washington",
      fips_code: "42125",
    },
    {
      name: "Wayne",
      fips_code: "42127",
    },
    {
      name: "Westmoreland",
      fips_code: "42129",
    },
    {
      name: "Wyoming",
      fips_code: "42131",
    },
    {
      name: "York",
      fips_code: "42133",
    },
  ],
  RI: [
    {
      name: "Bristol",
      fips_code: "44001",
    },
    {
      name: "Kent",
      fips_code: "44003",
    },
    {
      name: "Newport",
      fips_code: "44005",
    },
    {
      name: "Providence",
      fips_code: "44007",
    },
    {
      name: "Washington",
      fips_code: "44009",
    },
  ],
  SC: [
    {
      name: "Abbeville",
      fips_code: "45001",
    },
    {
      name: "Aiken",
      fips_code: "45003",
    },
    {
      name: "Allendale",
      fips_code: "45005",
    },
    {
      name: "Anderson",
      fips_code: "45007",
    },
    {
      name: "Bamberg",
      fips_code: "45009",
    },
    {
      name: "Barnwell",
      fips_code: "45011",
    },
    {
      name: "Beaufort",
      fips_code: "45013",
    },
    {
      name: "Berkeley",
      fips_code: "45015",
    },
    {
      name: "Calhoun",
      fips_code: "45017",
    },
    {
      name: "Charleston",
      fips_code: "45019",
    },
    {
      name: "Cherokee",
      fips_code: "45021",
    },
    {
      name: "Chester",
      fips_code: "45023",
    },
    {
      name: "Chesterfield",
      fips_code: "45025",
    },
    {
      name: "Clarendon",
      fips_code: "45027",
    },
    {
      name: "Colleton",
      fips_code: "45029",
    },
    {
      name: "Darlington",
      fips_code: "45031",
    },
    {
      name: "Dillon",
      fips_code: "45033",
    },
    {
      name: "Dorchester",
      fips_code: "45035",
    },
    {
      name: "Edgefield",
      fips_code: "45037",
    },
    {
      name: "Fairfield",
      fips_code: "45039",
    },
    {
      name: "Florence",
      fips_code: "45041",
    },
    {
      name: "Georgetown",
      fips_code: "45043",
    },
    {
      name: "Greenville",
      fips_code: "45045",
    },
    {
      name: "Greenwood",
      fips_code: "45047",
    },
    {
      name: "Hampton",
      fips_code: "45049",
    },
    {
      name: "Horry",
      fips_code: "45051",
    },
    {
      name: "Jasper",
      fips_code: "45053",
    },
    {
      name: "Kershaw",
      fips_code: "45055",
    },
    {
      name: "Lancaster",
      fips_code: "45057",
    },
    {
      name: "Laurens",
      fips_code: "45059",
    },
    {
      name: "Lee",
      fips_code: "45061",
    },
    {
      name: "Lexington",
      fips_code: "45063",
    },
    {
      name: "Marion",
      fips_code: "45067",
    },
    {
      name: "Marlboro",
      fips_code: "45069",
    },
    {
      name: "McCormick",
      fips_code: "45065",
    },
    {
      name: "Newberry",
      fips_code: "45071",
    },
    {
      name: "Oconee",
      fips_code: "45073",
    },
    {
      name: "Orangeburg",
      fips_code: "45075",
    },
    {
      name: "Pickens",
      fips_code: "45077",
    },
    {
      name: "Richland",
      fips_code: "45079",
    },
    {
      name: "Saluda",
      fips_code: "45081",
    },
    {
      name: "Spartanburg",
      fips_code: "45083",
    },
    {
      name: "Sumter",
      fips_code: "45085",
    },
    {
      name: "Union",
      fips_code: "45087",
    },
    {
      name: "Williamsburg",
      fips_code: "45089",
    },
    {
      name: "York",
      fips_code: "45091",
    },
  ],
  SD: [
    {
      name: "Aurora",
      fips_code: "46003",
    },
    {
      name: "Beadle",
      fips_code: "46005",
    },
    {
      name: "Bennett",
      fips_code: "46007",
    },
    {
      name: "Bon Homme",
      fips_code: "46009",
    },
    {
      name: "Brookings",
      fips_code: "46011",
    },
    {
      name: "Brown",
      fips_code: "46013",
    },
    {
      name: "Brule",
      fips_code: "46015",
    },
    {
      name: "Buffalo",
      fips_code: "46017",
    },
    {
      name: "Butte",
      fips_code: "46019",
    },
    {
      name: "Campbell",
      fips_code: "46021",
    },
    {
      name: "Charles Mix",
      fips_code: "46023",
    },
    {
      name: "Clark",
      fips_code: "46025",
    },
    {
      name: "Clay",
      fips_code: "46027",
    },
    {
      name: "Codington",
      fips_code: "46029",
    },
    {
      name: "Corson",
      fips_code: "46031",
    },
    {
      name: "Custer",
      fips_code: "46033",
    },
    {
      name: "Davison",
      fips_code: "46035",
    },
    {
      name: "Day",
      fips_code: "46037",
    },
    {
      name: "Deuel",
      fips_code: "46039",
    },
    {
      name: "Dewey",
      fips_code: "46041",
    },
    {
      name: "Douglas",
      fips_code: "46043",
    },
    {
      name: "Edmunds",
      fips_code: "46045",
    },
    {
      name: "Fall River",
      fips_code: "46047",
    },
    {
      name: "Faulk",
      fips_code: "46049",
    },
    {
      name: "Grant",
      fips_code: "46051",
    },
    {
      name: "Gregory",
      fips_code: "46053",
    },
    {
      name: "Haakon",
      fips_code: "46055",
    },
    {
      name: "Hamlin",
      fips_code: "46057",
    },
    {
      name: "Hand",
      fips_code: "46059",
    },
    {
      name: "Hanson",
      fips_code: "46061",
    },
    {
      name: "Harding",
      fips_code: "46063",
    },
    {
      name: "Hughes",
      fips_code: "46065",
    },
    {
      name: "Hutchinson",
      fips_code: "46067",
    },
    {
      name: "Hyde",
      fips_code: "46069",
    },
    {
      name: "Jackson",
      fips_code: "46071",
    },
    {
      name: "Jerauld",
      fips_code: "46073",
    },
    {
      name: "Jones",
      fips_code: "46075",
    },
    {
      name: "Kingsbury",
      fips_code: "46077",
    },
    {
      name: "Lake",
      fips_code: "46079",
    },
    {
      name: "Lawrence",
      fips_code: "46081",
    },
    {
      name: "Lincoln",
      fips_code: "46083",
    },
    {
      name: "Lyman",
      fips_code: "46085",
    },
    {
      name: "Marshall",
      fips_code: "46091",
    },
    {
      name: "McCook",
      fips_code: "46087",
    },
    {
      name: "McPherson",
      fips_code: "46089",
    },
    {
      name: "Meade",
      fips_code: "46093",
    },
    {
      name: "Mellette",
      fips_code: "46095",
    },
    {
      name: "Miner",
      fips_code: "46097",
    },
    {
      name: "Minnehaha",
      fips_code: "46099",
    },
    {
      name: "Moody",
      fips_code: "46101",
    },
    {
      name: "Pennington",
      fips_code: "46103",
    },
    {
      name: "Perkins",
      fips_code: "46105",
    },
    {
      name: "Potter",
      fips_code: "46107",
    },
    {
      name: "Roberts",
      fips_code: "46109",
    },
    {
      name: "Sanborn",
      fips_code: "46111",
    },
    {
      name: "Shannon",
      fips_code: "46113",
    },
    {
      name: "Spink",
      fips_code: "46115",
    },
    {
      name: "Stanley",
      fips_code: "46117",
    },
    {
      name: "Sully",
      fips_code: "46119",
    },
    {
      name: "Todd",
      fips_code: "46121",
    },
    {
      name: "Tripp",
      fips_code: "46123",
    },
    {
      name: "Turner",
      fips_code: "46125",
    },
    {
      name: "Union",
      fips_code: "46127",
    },
    {
      name: "Walworth",
      fips_code: "46129",
    },
    {
      name: "Yankton",
      fips_code: "46135",
    },
    {
      name: "Ziebach",
      fips_code: "46137",
    },
  ],
  TN: [
    {
      name: "Anderson",
      fips_code: "47001",
    },
    {
      name: "Bedford",
      fips_code: "47003",
    },
    {
      name: "Benton",
      fips_code: "47005",
    },
    {
      name: "Bledsoe",
      fips_code: "47007",
    },
    {
      name: "Blount",
      fips_code: "47009",
    },
    {
      name: "Bradley",
      fips_code: "47011",
    },
    {
      name: "Campbell",
      fips_code: "47013",
    },
    {
      name: "Cannon",
      fips_code: "47015",
    },
    {
      name: "Carroll",
      fips_code: "47017",
    },
    {
      name: "Carter",
      fips_code: "47019",
    },
    {
      name: "Cheatham",
      fips_code: "47021",
    },
    {
      name: "Chester",
      fips_code: "47023",
    },
    {
      name: "Claiborne",
      fips_code: "47025",
    },
    {
      name: "Clay",
      fips_code: "47027",
    },
    {
      name: "Cocke",
      fips_code: "47029",
    },
    {
      name: "Coffee",
      fips_code: "47031",
    },
    {
      name: "Crockett",
      fips_code: "47033",
    },
    {
      name: "Cumberland",
      fips_code: "47035",
    },
    {
      name: "Davidson",
      fips_code: "47037",
    },
    {
      name: "Decatur",
      fips_code: "47039",
    },
    {
      name: "DeKalb",
      fips_code: "47041",
    },
    {
      name: "Dickson",
      fips_code: "47043",
    },
    {
      name: "Dyer",
      fips_code: "47045",
    },
    {
      name: "Fayette",
      fips_code: "47047",
    },
    {
      name: "Fentress",
      fips_code: "47049",
    },
    {
      name: "Franklin",
      fips_code: "47051",
    },
    {
      name: "Gibson",
      fips_code: "47053",
    },
    {
      name: "Giles",
      fips_code: "47055",
    },
    {
      name: "Grainger",
      fips_code: "47057",
    },
    {
      name: "Greene",
      fips_code: "47059",
    },
    {
      name: "Grundy",
      fips_code: "47061",
    },
    {
      name: "Hamblen",
      fips_code: "47063",
    },
    {
      name: "Hamilton",
      fips_code: "47065",
    },
    {
      name: "Hancock",
      fips_code: "47067",
    },
    {
      name: "Hardeman",
      fips_code: "47069",
    },
    {
      name: "Hardin",
      fips_code: "47071",
    },
    {
      name: "Hawkins",
      fips_code: "47073",
    },
    {
      name: "Haywood",
      fips_code: "47075",
    },
    {
      name: "Henderson",
      fips_code: "47077",
    },
    {
      name: "Henry",
      fips_code: "47079",
    },
    {
      name: "Hickman",
      fips_code: "47081",
    },
    {
      name: "Houston",
      fips_code: "47083",
    },
    {
      name: "Humphreys",
      fips_code: "47085",
    },
    {
      name: "Jackson",
      fips_code: "47087",
    },
    {
      name: "Jefferson",
      fips_code: "47089",
    },
    {
      name: "Johnson",
      fips_code: "47091",
    },
    {
      name: "Knox",
      fips_code: "47093",
    },
    {
      name: "Lake",
      fips_code: "47095",
    },
    {
      name: "Lauderdale",
      fips_code: "47097",
    },
    {
      name: "Lawrence",
      fips_code: "47099",
    },
    {
      name: "Lewis",
      fips_code: "47101",
    },
    {
      name: "Lincoln",
      fips_code: "47103",
    },
    {
      name: "Loudon",
      fips_code: "47105",
    },
    {
      name: "Macon",
      fips_code: "47111",
    },
    {
      name: "Madison",
      fips_code: "47113",
    },
    {
      name: "Marion",
      fips_code: "47115",
    },
    {
      name: "Marshall",
      fips_code: "47117",
    },
    {
      name: "Maury",
      fips_code: "47119",
    },
    {
      name: "McMinn",
      fips_code: "47107",
    },
    {
      name: "McNairy",
      fips_code: "47109",
    },
    {
      name: "Meigs",
      fips_code: "47121",
    },
    {
      name: "Monroe",
      fips_code: "47123",
    },
    {
      name: "Montgomery",
      fips_code: "47125",
    },
    {
      name: "Moore",
      fips_code: "47127",
    },
    {
      name: "Morgan",
      fips_code: "47129",
    },
    {
      name: "Obion",
      fips_code: "47131",
    },
    {
      name: "Overton",
      fips_code: "47133",
    },
    {
      name: "Perry",
      fips_code: "47135",
    },
    {
      name: "Pickett",
      fips_code: "47137",
    },
    {
      name: "Polk",
      fips_code: "47139",
    },
    {
      name: "Putnam",
      fips_code: "47141",
    },
    {
      name: "Rhea",
      fips_code: "47143",
    },
    {
      name: "Roane",
      fips_code: "47145",
    },
    {
      name: "Robertson",
      fips_code: "47147",
    },
    {
      name: "Rutherford",
      fips_code: "47149",
    },
    {
      name: "Scott",
      fips_code: "47151",
    },
    {
      name: "Sequatchie",
      fips_code: "47153",
    },
    {
      name: "Sevier",
      fips_code: "47155",
    },
    {
      name: "Shelby",
      fips_code: "47157",
    },
    {
      name: "Smith",
      fips_code: "47159",
    },
    {
      name: "Stewart",
      fips_code: "47161",
    },
    {
      name: "Sullivan",
      fips_code: "47163",
    },
    {
      name: "Sumner",
      fips_code: "47165",
    },
    {
      name: "Tipton",
      fips_code: "47167",
    },
    {
      name: "Trousdale",
      fips_code: "47169",
    },
    {
      name: "Unicoi",
      fips_code: "47171",
    },
    {
      name: "Union",
      fips_code: "47173",
    },
    {
      name: "Van Buren",
      fips_code: "47175",
    },
    {
      name: "Warren",
      fips_code: "47177",
    },
    {
      name: "Washington",
      fips_code: "47179",
    },
    {
      name: "Wayne",
      fips_code: "47181",
    },
    {
      name: "Weakley",
      fips_code: "47183",
    },
    {
      name: "White",
      fips_code: "47185",
    },
    {
      name: "Williamson",
      fips_code: "47187",
    },
    {
      name: "Wilson",
      fips_code: "47189",
    },
  ],
  TX: [
    {
      name: "Anderson",
      fips_code: "48001",
    },
    {
      name: "Andrews",
      fips_code: "48003",
    },
    {
      name: "Angelina",
      fips_code: "48005",
    },
    {
      name: "Aransas",
      fips_code: "48007",
    },
    {
      name: "Archer",
      fips_code: "48009",
    },
    {
      name: "Armstrong",
      fips_code: "48011",
    },
    {
      name: "Atascosa",
      fips_code: "48013",
    },
    {
      name: "Austin",
      fips_code: "48015",
    },
    {
      name: "Bailey",
      fips_code: "48017",
    },
    {
      name: "Bandera",
      fips_code: "48019",
    },
    {
      name: "Bastrop",
      fips_code: "48021",
    },
    {
      name: "Baylor",
      fips_code: "48023",
    },
    {
      name: "Bee",
      fips_code: "48025",
    },
    {
      name: "Bell",
      fips_code: "48027",
    },
    {
      name: "Bexar",
      fips_code: "48029",
    },
    {
      name: "Blanco",
      fips_code: "48031",
    },
    {
      name: "Borden",
      fips_code: "48033",
    },
    {
      name: "Bosque",
      fips_code: "48035",
    },
    {
      name: "Bowie",
      fips_code: "48037",
    },
    {
      name: "Brazoria",
      fips_code: "48039",
    },
    {
      name: "Brazos",
      fips_code: "48041",
    },
    {
      name: "Brewster",
      fips_code: "48043",
    },
    {
      name: "Briscoe",
      fips_code: "48045",
    },
    {
      name: "Brooks",
      fips_code: "48047",
    },
    {
      name: "Brown",
      fips_code: "48049",
    },
    {
      name: "Burleson",
      fips_code: "48051",
    },
    {
      name: "Burnet",
      fips_code: "48053",
    },
    {
      name: "Caldwell",
      fips_code: "48055",
    },
    {
      name: "Calhoun",
      fips_code: "48057",
    },
    {
      name: "Callahan",
      fips_code: "48059",
    },
    {
      name: "Cameron",
      fips_code: "48061",
    },
    {
      name: "Camp",
      fips_code: "48063",
    },
    {
      name: "Carson",
      fips_code: "48065",
    },
    {
      name: "Cass",
      fips_code: "48067",
    },
    {
      name: "Castro",
      fips_code: "48069",
    },
    {
      name: "Chambers",
      fips_code: "48071",
    },
    {
      name: "Cherokee",
      fips_code: "48073",
    },
    {
      name: "Childress",
      fips_code: "48075",
    },
    {
      name: "Clay",
      fips_code: "48077",
    },
    {
      name: "Cochran",
      fips_code: "48079",
    },
    {
      name: "Coke",
      fips_code: "48081",
    },
    {
      name: "Coleman",
      fips_code: "48083",
    },
    {
      name: "Collin",
      fips_code: "48085",
    },
    {
      name: "Collingsworth",
      fips_code: "48087",
    },
    {
      name: "Colorado",
      fips_code: "48089",
    },
    {
      name: "Comal",
      fips_code: "48091",
    },
    {
      name: "Comanche",
      fips_code: "48093",
    },
    {
      name: "Concho",
      fips_code: "48095",
    },
    {
      name: "Cooke",
      fips_code: "48097",
    },
    {
      name: "Coryell",
      fips_code: "48099",
    },
    {
      name: "Cottle",
      fips_code: "48101",
    },
    {
      name: "Crane",
      fips_code: "48103",
    },
    {
      name: "Crockett",
      fips_code: "48105",
    },
    {
      name: "Crosby",
      fips_code: "48107",
    },
    {
      name: "Culberson",
      fips_code: "48109",
    },
    {
      name: "Dallam",
      fips_code: "48111",
    },
    {
      name: "Dallas",
      fips_code: "48113",
    },
    {
      name: "Dawson",
      fips_code: "48115",
    },
    {
      name: "Deaf Smith",
      fips_code: "48117",
    },
    {
      name: "Delta",
      fips_code: "48119",
    },
    {
      name: "Denton",
      fips_code: "48121",
    },
    {
      name: "DeWitt",
      fips_code: "48123",
    },
    {
      name: "Dickens",
      fips_code: "48125",
    },
    {
      name: "Dimmit",
      fips_code: "48127",
    },
    {
      name: "Donley",
      fips_code: "48129",
    },
    {
      name: "Duval",
      fips_code: "48131",
    },
    {
      name: "Eastland",
      fips_code: "48133",
    },
    {
      name: "Ector",
      fips_code: "48135",
    },
    {
      name: "Edwards",
      fips_code: "48137",
    },
    {
      name: "El Paso",
      fips_code: "48141",
    },
    {
      name: "Ellis",
      fips_code: "48139",
    },
    {
      name: "Erath",
      fips_code: "48143",
    },
    {
      name: "Falls",
      fips_code: "48145",
    },
    {
      name: "Fannin",
      fips_code: "48147",
    },
    {
      name: "Fayette",
      fips_code: "48149",
    },
    {
      name: "Fisher",
      fips_code: "48151",
    },
    {
      name: "Floyd",
      fips_code: "48153",
    },
    {
      name: "Foard",
      fips_code: "48155",
    },
    {
      name: "Fort Bend",
      fips_code: "48157",
    },
    {
      name: "Franklin",
      fips_code: "48159",
    },
    {
      name: "Freestone",
      fips_code: "48161",
    },
    {
      name: "Frio",
      fips_code: "48163",
    },
    {
      name: "Gaines",
      fips_code: "48165",
    },
    {
      name: "Galveston",
      fips_code: "48167",
    },
    {
      name: "Garza",
      fips_code: "48169",
    },
    {
      name: "Gillespie",
      fips_code: "48171",
    },
    {
      name: "Glasscock",
      fips_code: "48173",
    },
    {
      name: "Goliad",
      fips_code: "48175",
    },
    {
      name: "Gonzales",
      fips_code: "48177",
    },
    {
      name: "Gray",
      fips_code: "48179",
    },
    {
      name: "Grayson",
      fips_code: "48181",
    },
    {
      name: "Gregg",
      fips_code: "48183",
    },
    {
      name: "Grimes",
      fips_code: "48185",
    },
    {
      name: "Guadalupe",
      fips_code: "48187",
    },
    {
      name: "Hale",
      fips_code: "48189",
    },
    {
      name: "Hall",
      fips_code: "48191",
    },
    {
      name: "Hamilton",
      fips_code: "48193",
    },
    {
      name: "Hansford",
      fips_code: "48195",
    },
    {
      name: "Hardeman",
      fips_code: "48197",
    },
    {
      name: "Hardin",
      fips_code: "48199",
    },
    {
      name: "Harris",
      fips_code: "48201",
    },
    {
      name: "Harrison",
      fips_code: "48203",
    },
    {
      name: "Hartley",
      fips_code: "48205",
    },
    {
      name: "Haskell",
      fips_code: "48207",
    },
    {
      name: "Hays",
      fips_code: "48209",
    },
    {
      name: "Hemphill",
      fips_code: "48211",
    },
    {
      name: "Henderson",
      fips_code: "48213",
    },
    {
      name: "Hidalgo",
      fips_code: "48215",
    },
    {
      name: "Hill",
      fips_code: "48217",
    },
    {
      name: "Hockley",
      fips_code: "48219",
    },
    {
      name: "Hood",
      fips_code: "48221",
    },
    {
      name: "Hopkins",
      fips_code: "48223",
    },
    {
      name: "Houston",
      fips_code: "48225",
    },
    {
      name: "Howard",
      fips_code: "48227",
    },
    {
      name: "Hudspeth",
      fips_code: "48229",
    },
    {
      name: "Hunt",
      fips_code: "48231",
    },
    {
      name: "Hutchinson",
      fips_code: "48233",
    },
    {
      name: "Irion",
      fips_code: "48235",
    },
    {
      name: "Jack",
      fips_code: "48237",
    },
    {
      name: "Jackson",
      fips_code: "48239",
    },
    {
      name: "Jasper",
      fips_code: "48241",
    },
    {
      name: "Jeff Davis",
      fips_code: "48243",
    },
    {
      name: "Jefferson",
      fips_code: "48245",
    },
    {
      name: "Jim Hogg",
      fips_code: "48247",
    },
    {
      name: "Jim Wells",
      fips_code: "48249",
    },
    {
      name: "Johnson",
      fips_code: "48251",
    },
    {
      name: "Jones",
      fips_code: "48253",
    },
    {
      name: "Karnes",
      fips_code: "48255",
    },
    {
      name: "Kaufman",
      fips_code: "48257",
    },
    {
      name: "Kendall",
      fips_code: "48259",
    },
    {
      name: "Kenedy",
      fips_code: "48261",
    },
    {
      name: "Kent",
      fips_code: "48263",
    },
    {
      name: "Kerr",
      fips_code: "48265",
    },
    {
      name: "Kimble",
      fips_code: "48267",
    },
    {
      name: "King",
      fips_code: "48269",
    },
    {
      name: "Kinney",
      fips_code: "48271",
    },
    {
      name: "Kleberg",
      fips_code: "48273",
    },
    {
      name: "Knox",
      fips_code: "48275",
    },
    {
      name: "La Salle",
      fips_code: "48283",
    },
    {
      name: "Lamar",
      fips_code: "48277",
    },
    {
      name: "Lamb",
      fips_code: "48279",
    },
    {
      name: "Lampasas",
      fips_code: "48281",
    },
    {
      name: "Lavaca",
      fips_code: "48285",
    },
    {
      name: "Lee",
      fips_code: "48287",
    },
    {
      name: "Leon",
      fips_code: "48289",
    },
    {
      name: "Liberty",
      fips_code: "48291",
    },
    {
      name: "Limestone",
      fips_code: "48293",
    },
    {
      name: "Lipscomb",
      fips_code: "48295",
    },
    {
      name: "Live Oak",
      fips_code: "48297",
    },
    {
      name: "Llano",
      fips_code: "48299",
    },
    {
      name: "Loving",
      fips_code: "48301",
    },
    {
      name: "Lubbock",
      fips_code: "48303",
    },
    {
      name: "Lynn",
      fips_code: "48305",
    },
    {
      name: "Madison",
      fips_code: "48313",
    },
    {
      name: "Marion",
      fips_code: "48315",
    },
    {
      name: "Martin",
      fips_code: "48317",
    },
    {
      name: "Mason",
      fips_code: "48319",
    },
    {
      name: "Matagorda",
      fips_code: "48321",
    },
    {
      name: "Maverick",
      fips_code: "48323",
    },
    {
      name: "McCulloch",
      fips_code: "48307",
    },
    {
      name: "McLennan",
      fips_code: "48309",
    },
    {
      name: "McMullen",
      fips_code: "48311",
    },
    {
      name: "Medina",
      fips_code: "48325",
    },
    {
      name: "Menard",
      fips_code: "48327",
    },
    {
      name: "Midland",
      fips_code: "48329",
    },
    {
      name: "Milam",
      fips_code: "48331",
    },
    {
      name: "Mills",
      fips_code: "48333",
    },
    {
      name: "Mitchell",
      fips_code: "48335",
    },
    {
      name: "Montague",
      fips_code: "48337",
    },
    {
      name: "Montgomery",
      fips_code: "48339",
    },
    {
      name: "Moore",
      fips_code: "48341",
    },
    {
      name: "Morris",
      fips_code: "48343",
    },
    {
      name: "Motley",
      fips_code: "48345",
    },
    {
      name: "Nacogdoches",
      fips_code: "48347",
    },
    {
      name: "Navarro",
      fips_code: "48349",
    },
    {
      name: "Newton",
      fips_code: "48351",
    },
    {
      name: "Nolan",
      fips_code: "48353",
    },
    {
      name: "Nueces",
      fips_code: "48355",
    },
    {
      name: "Ochiltree",
      fips_code: "48357",
    },
    {
      name: "Oldham",
      fips_code: "48359",
    },
    {
      name: "Orange",
      fips_code: "48361",
    },
    {
      name: "Palo Pinto",
      fips_code: "48363",
    },
    {
      name: "Panola",
      fips_code: "48365",
    },
    {
      name: "Parker",
      fips_code: "48367",
    },
    {
      name: "Parmer",
      fips_code: "48369",
    },
    {
      name: "Pecos",
      fips_code: "48371",
    },
    {
      name: "Polk",
      fips_code: "48373",
    },
    {
      name: "Potter",
      fips_code: "48375",
    },
    {
      name: "Presidio",
      fips_code: "48377",
    },
    {
      name: "Rains",
      fips_code: "48379",
    },
    {
      name: "Randall",
      fips_code: "48381",
    },
    {
      name: "Reagan",
      fips_code: "48383",
    },
    {
      name: "Real",
      fips_code: "48385",
    },
    {
      name: "Red River",
      fips_code: "48387",
    },
    {
      name: "Reeves",
      fips_code: "48389",
    },
    {
      name: "Refugio",
      fips_code: "48391",
    },
    {
      name: "Roberts",
      fips_code: "48393",
    },
    {
      name: "Robertson",
      fips_code: "48395",
    },
    {
      name: "Rockwall",
      fips_code: "48397",
    },
    {
      name: "Runnels",
      fips_code: "48399",
    },
    {
      name: "Rusk",
      fips_code: "48401",
    },
    {
      name: "Sabine",
      fips_code: "48403",
    },
    {
      name: "San Augustine",
      fips_code: "48405",
    },
    {
      name: "San Jacinto",
      fips_code: "48407",
    },
    {
      name: "San Patricio",
      fips_code: "48409",
    },
    {
      name: "San Saba",
      fips_code: "48411",
    },
    {
      name: "Schleicher",
      fips_code: "48413",
    },
    {
      name: "Scurry",
      fips_code: "48415",
    },
    {
      name: "Shackelford",
      fips_code: "48417",
    },
    {
      name: "Shelby",
      fips_code: "48419",
    },
    {
      name: "Sherman",
      fips_code: "48421",
    },
    {
      name: "Smith",
      fips_code: "48423",
    },
    {
      name: "Somervell",
      fips_code: "48425",
    },
    {
      name: "Starr",
      fips_code: "48427",
    },
    {
      name: "Stephens",
      fips_code: "48429",
    },
    {
      name: "Sterling",
      fips_code: "48431",
    },
    {
      name: "Stonewall",
      fips_code: "48433",
    },
    {
      name: "Sutton",
      fips_code: "48435",
    },
    {
      name: "Swisher",
      fips_code: "48437",
    },
    {
      name: "Tarrant",
      fips_code: "48439",
    },
    {
      name: "Taylor",
      fips_code: "48441",
    },
    {
      name: "Terrell",
      fips_code: "48443",
    },
    {
      name: "Terry",
      fips_code: "48445",
    },
    {
      name: "Throckmorton",
      fips_code: "48447",
    },
    {
      name: "Titus",
      fips_code: "48449",
    },
    {
      name: "Tom Green",
      fips_code: "48451",
    },
    {
      name: "Travis",
      fips_code: "48453",
    },
    {
      name: "Trinity",
      fips_code: "48455",
    },
    {
      name: "Tyler",
      fips_code: "48457",
    },
    {
      name: "Upshur",
      fips_code: "48459",
    },
    {
      name: "Upton",
      fips_code: "48461",
    },
    {
      name: "Uvalde",
      fips_code: "48463",
    },
    {
      name: "Val Verde",
      fips_code: "48465",
    },
    {
      name: "Van Zandt",
      fips_code: "48467",
    },
    {
      name: "Victoria",
      fips_code: "48469",
    },
    {
      name: "Walker",
      fips_code: "48471",
    },
    {
      name: "Waller",
      fips_code: "48473",
    },
    {
      name: "Ward",
      fips_code: "48475",
    },
    {
      name: "Washington",
      fips_code: "48477",
    },
    {
      name: "Webb",
      fips_code: "48479",
    },
    {
      name: "Wharton",
      fips_code: "48481",
    },
    {
      name: "Wheeler",
      fips_code: "48483",
    },
    {
      name: "Wichita",
      fips_code: "48485",
    },
    {
      name: "Wilbarger",
      fips_code: "48487",
    },
    {
      name: "Willacy",
      fips_code: "48489",
    },
    {
      name: "Williamson",
      fips_code: "48491",
    },
    {
      name: "Wilson",
      fips_code: "48493",
    },
    {
      name: "Winkler",
      fips_code: "48495",
    },
    {
      name: "Wise",
      fips_code: "48497",
    },
    {
      name: "Wood",
      fips_code: "48499",
    },
    {
      name: "Yoakum",
      fips_code: "48501",
    },
    {
      name: "Young",
      fips_code: "48503",
    },
    {
      name: "Zapata",
      fips_code: "48505",
    },
    {
      name: "Zavala",
      fips_code: "48507",
    },
  ],
  UT: [
    {
      name: "Beaver",
      fips_code: "49001",
    },
    {
      name: "Box Elder",
      fips_code: "49003",
    },
    {
      name: "Cache",
      fips_code: "49005",
    },
    {
      name: "Carbon",
      fips_code: "49007",
    },
    {
      name: "Daggett",
      fips_code: "49009",
    },
    {
      name: "Davis",
      fips_code: "49011",
    },
    {
      name: "Duchesne",
      fips_code: "49013",
    },
    {
      name: "Emery",
      fips_code: "49015",
    },
    {
      name: "Garfield",
      fips_code: "49017",
    },
    {
      name: "Grand",
      fips_code: "49019",
    },
    {
      name: "Iron",
      fips_code: "49021",
    },
    {
      name: "Juab",
      fips_code: "49023",
    },
    {
      name: "Kane",
      fips_code: "49025",
    },
    {
      name: "Millard",
      fips_code: "49027",
    },
    {
      name: "Morgan",
      fips_code: "49029",
    },
    {
      name: "Piute",
      fips_code: "49031",
    },
    {
      name: "Rich",
      fips_code: "49033",
    },
    {
      name: "Salt Lake",
      fips_code: "49035",
    },
    {
      name: "San Juan",
      fips_code: "49037",
    },
    {
      name: "Sanpete",
      fips_code: "49039",
    },
    {
      name: "Sevier",
      fips_code: "49041",
    },
    {
      name: "Summit",
      fips_code: "49043",
    },
    {
      name: "Tooele",
      fips_code: "49045",
    },
    {
      name: "Uintah",
      fips_code: "49047",
    },
    {
      name: "Utah",
      fips_code: "49049",
    },
    {
      name: "Wasatch",
      fips_code: "49051",
    },
    {
      name: "Washington",
      fips_code: "49053",
    },
    {
      name: "Wayne",
      fips_code: "49055",
    },
    {
      name: "Weber",
      fips_code: "49057",
    },
  ],
  VT: [
    {
      name: "Addison",
      fips_code: "50001",
    },
    {
      name: "Bennington",
      fips_code: "50003",
    },
    {
      name: "Caledonia",
      fips_code: "50005",
    },
    {
      name: "Chittenden",
      fips_code: "50007",
    },
    {
      name: "Essex",
      fips_code: "50009",
    },
    {
      name: "Franklin",
      fips_code: "50011",
    },
    {
      name: "Grand Isle",
      fips_code: "50013",
    },
    {
      name: "Lamoille",
      fips_code: "50015",
    },
    {
      name: "Orange",
      fips_code: "50017",
    },
    {
      name: "Orleans",
      fips_code: "50019",
    },
    {
      name: "Rutland",
      fips_code: "50021",
    },
    {
      name: "Washington",
      fips_code: "50023",
    },
    {
      name: "Windham",
      fips_code: "50025",
    },
    {
      name: "Windsor",
      fips_code: "50027",
    },
  ],
  VA: [
    {
      name: "Accomack",
      fips_code: "51001",
    },
    {
      name: "Albemarle",
      fips_code: "51003",
    },
    {
      name: "Alexandria (City)",
      fips_code: "51510",
    },
    {
      name: "Alleghany",
      fips_code: "51005",
    },
    {
      name: "Amelia",
      fips_code: "51007",
    },
    {
      name: "Amherst",
      fips_code: "51009",
    },
    {
      name: "Appomattox",
      fips_code: "51011",
    },
    {
      name: "Arlington",
      fips_code: "51013",
    },
    {
      name: "Augusta",
      fips_code: "51015",
    },
    {
      name: "Bath",
      fips_code: "51017",
    },
    {
      name: "Bedford",
      fips_code: "51019",
    },
    {
      name: "Bedford (City)",
      fips_code: "51515",
    },
    {
      name: "Bland",
      fips_code: "51021",
    },
    {
      name: "Botetourt",
      fips_code: "51023",
    },
    {
      name: "Bristol (City)",
      fips_code: "51520",
    },
    {
      name: "Brunswick",
      fips_code: "51025",
    },
    {
      name: "Buchanan",
      fips_code: "51027",
    },
    {
      name: "Buckingham",
      fips_code: "51029",
    },
    {
      name: "Buena Vista (City)",
      fips_code: "51530",
    },
    {
      name: "Campbell",
      fips_code: "51031",
    },
    {
      name: "Caroline",
      fips_code: "51033",
    },
    {
      name: "Carroll",
      fips_code: "51035",
    },
    {
      name: "Charles City",
      fips_code: "51036",
    },
    {
      name: "Charlotte",
      fips_code: "51037",
    },
    {
      name: "Charlottesville (City)",
      fips_code: "51540",
    },
    {
      name: "Chesapeake (City)",
      fips_code: "51550",
    },
    {
      name: "Chesterfield",
      fips_code: "51041",
    },
    {
      name: "Clarke",
      fips_code: "51043",
    },
    {
      name: "Clifton Forge (City)",
      fips_code: "51560",
    },
    {
      name: "Colonial Heights (City)",
      fips_code: "51570",
    },
    {
      name: "Covington (City)",
      fips_code: "51580",
    },
    {
      name: "Craig",
      fips_code: "51045",
    },
    {
      name: "Culpeper",
      fips_code: "51047",
    },
    {
      name: "Cumberland",
      fips_code: "51049",
    },
    {
      name: "Danville (City)",
      fips_code: "51590",
    },
    {
      name: "Dickenson",
      fips_code: "51051",
    },
    {
      name: "Dinwiddie",
      fips_code: "51053",
    },
    {
      name: "Emporia (City)",
      fips_code: "51595",
    },
    {
      name: "Essex",
      fips_code: "51057",
    },
    {
      name: "Fairfax",
      fips_code: "51059",
    },
    {
      name: "Fairfax (City)",
      fips_code: "51600",
    },
    {
      name: "Falls Church (City)",
      fips_code: "51610",
    },
    {
      name: "Fauquier",
      fips_code: "51061",
    },
    {
      name: "Floyd",
      fips_code: "51063",
    },
    {
      name: "Fluvanna",
      fips_code: "51065",
    },
    {
      name: "Franklin",
      fips_code: "51067",
    },
    {
      name: "Franklin (City)",
      fips_code: "51620",
    },
    {
      name: "Frederick",
      fips_code: "51069",
    },
    {
      name: "Fredericksburg (City)",
      fips_code: "51630",
    },
    {
      name: "Galax (City)",
      fips_code: "51640",
    },
    {
      name: "Giles",
      fips_code: "51071",
    },
    {
      name: "Gloucester",
      fips_code: "51073",
    },
    {
      name: "Goochland",
      fips_code: "51075",
    },
    {
      name: "Grayson",
      fips_code: "51077",
    },
    {
      name: "Greene",
      fips_code: "51079",
    },
    {
      name: "Greensville",
      fips_code: "51081",
    },
    {
      name: "Halifax",
      fips_code: "51083",
    },
    {
      name: "Hampton (City)",
      fips_code: "51650",
    },
    {
      name: "Hanover",
      fips_code: "51085",
    },
    {
      name: "Harrisonburg (City)",
      fips_code: "51660",
    },
    {
      name: "Henrico",
      fips_code: "51087",
    },
    {
      name: "Henry",
      fips_code: "51089",
    },
    {
      name: "Highland",
      fips_code: "51091",
    },
    {
      name: "Hopewell (City)",
      fips_code: "51670",
    },
    {
      name: "Isle of Wight",
      fips_code: "51093",
    },
    {
      name: "James City",
      fips_code: "51095",
    },
    {
      name: "King and Queen",
      fips_code: "51097",
    },
    {
      name: "King George",
      fips_code: "51099",
    },
    {
      name: "King William",
      fips_code: "51101",
    },
    {
      name: "Lancaster",
      fips_code: "51103",
    },
    {
      name: "Lee",
      fips_code: "51105",
    },
    {
      name: "Lexington (City)",
      fips_code: "51678",
    },
    {
      name: "Loudoun",
      fips_code: "51107",
    },
    {
      name: "Louisa",
      fips_code: "51109",
    },
    {
      name: "Lunenburg",
      fips_code: "51111",
    },
    {
      name: "Lynchburg (City)",
      fips_code: "51680",
    },
    {
      name: "Madison",
      fips_code: "51113",
    },
    {
      name: "Manassas (City)",
      fips_code: "51683",
    },
    {
      name: "Manassas Park (City)",
      fips_code: "51685",
    },
    {
      name: "Martinsville (City)",
      fips_code: "51690",
    },
    {
      name: "Mathews",
      fips_code: "51115",
    },
    {
      name: "Mecklenburg",
      fips_code: "51117",
    },
    {
      name: "Middlesex",
      fips_code: "51119",
    },
    {
      name: "Montgomery",
      fips_code: "51121",
    },
    {
      name: "Nelson",
      fips_code: "51125",
    },
    {
      name: "New Kent",
      fips_code: "51127",
    },
    {
      name: "Newport News (City)",
      fips_code: "51700",
    },
    {
      name: "Norfolk (City)",
      fips_code: "51710",
    },
    {
      name: "Northampton",
      fips_code: "51131",
    },
    {
      name: "Northumberland",
      fips_code: "51133",
    },
    {
      name: "Norton (City)",
      fips_code: "51720",
    },
    {
      name: "Nottoway",
      fips_code: "51135",
    },
    {
      name: "Orange",
      fips_code: "51137",
    },
    {
      name: "Page",
      fips_code: "51139",
    },
    {
      name: "Patrick",
      fips_code: "51141",
    },
    {
      name: "Petersburg (City)",
      fips_code: "51730",
    },
    {
      name: "Pittsylvania",
      fips_code: "51143",
    },
    {
      name: "Poquoson (City)",
      fips_code: "51735",
    },
    {
      name: "Portsmouth (City)",
      fips_code: "51740",
    },
    {
      name: "Powhatan",
      fips_code: "51145",
    },
    {
      name: "Prince Edward",
      fips_code: "51147",
    },
    {
      name: "Prince George",
      fips_code: "51149",
    },
    {
      name: "Prince William",
      fips_code: "51153",
    },
    {
      name: "Pulaski",
      fips_code: "51155",
    },
    {
      name: "Radford (City)",
      fips_code: "51750",
    },
    {
      name: "Rappahannock",
      fips_code: "51157",
    },
    {
      name: "Richmond",
      fips_code: "51159",
    },
    {
      name: "Richmond (City)",
      fips_code: "51760",
    },
    {
      name: "Roanoke",
      fips_code: "51161",
    },
    {
      name: "Roanoke (City)",
      fips_code: "51770",
    },
    {
      name: "Rockbridge",
      fips_code: "51163",
    },
    {
      name: "Rockingham",
      fips_code: "51165",
    },
    {
      name: "Russell",
      fips_code: "51167",
    },
    {
      name: "Salem (City)",
      fips_code: "51775",
    },
    {
      name: "Scott",
      fips_code: "51169",
    },
    {
      name: "Shenandoah",
      fips_code: "51171",
    },
    {
      name: "Smyth",
      fips_code: "51173",
    },
    {
      name: "South Boston (City)",
      fips_code: "51780",
    },
    {
      name: "Southampton",
      fips_code: "51175",
    },
    {
      name: "Spotsylvania",
      fips_code: "51177",
    },
    {
      name: "Stafford",
      fips_code: "51179",
    },
    {
      name: "Staunton (City)",
      fips_code: "51790",
    },
    {
      name: "Suffolk (City)",
      fips_code: "51800",
    },
    {
      name: "Surry",
      fips_code: "51181",
    },
    {
      name: "Sussex",
      fips_code: "51183",
    },
    {
      name: "Tazewell",
      fips_code: "51185",
    },
    {
      name: "Virginia Beach (City)",
      fips_code: "51810",
    },
    {
      name: "Warren",
      fips_code: "51187",
    },
    {
      name: "Washington",
      fips_code: "51191",
    },
    {
      name: "Waynesboro (City)",
      fips_code: "51820",
    },
    {
      name: "Westmoreland",
      fips_code: "51193",
    },
    {
      name: "Williamsburg (City)",
      fips_code: "51830",
    },
    {
      name: "Winchester (City)",
      fips_code: "51840",
    },
    {
      name: "Wise",
      fips_code: "51195",
    },
    {
      name: "Wythe",
      fips_code: "51197",
    },
    {
      name: "York",
      fips_code: "51199",
    },
  ],
  WA: [
    {
      name: "Adams",
      fips_code: "53001",
    },
    {
      name: "Asotin",
      fips_code: "53003",
    },
    {
      name: "Benton",
      fips_code: "53005",
    },
    {
      name: "Chelan",
      fips_code: "53007",
    },
    {
      name: "Clallam",
      fips_code: "53009",
    },
    {
      name: "Clark",
      fips_code: "53011",
    },
    {
      name: "Columbia",
      fips_code: "53013",
    },
    {
      name: "Cowlitz",
      fips_code: "53015",
    },
    {
      name: "Douglas",
      fips_code: "53017",
    },
    {
      name: "Ferry",
      fips_code: "53019",
    },
    {
      name: "Franklin",
      fips_code: "53021",
    },
    {
      name: "Garfield",
      fips_code: "53023",
    },
    {
      name: "Grant",
      fips_code: "53025",
    },
    {
      name: "Grays Harbor",
      fips_code: "53027",
    },
    {
      name: "Island",
      fips_code: "53029",
    },
    {
      name: "Jefferson",
      fips_code: "53031",
    },
    {
      name: "King",
      fips_code: "53033",
    },
    {
      name: "Kitsap",
      fips_code: "53035",
    },
    {
      name: "Kittitas",
      fips_code: "53037",
    },
    {
      name: "Klickitat",
      fips_code: "53039",
    },
    {
      name: "Lewis",
      fips_code: "53041",
    },
    {
      name: "Lincoln",
      fips_code: "53043",
    },
    {
      name: "Mason",
      fips_code: "53045",
    },
    {
      name: "Okanogan",
      fips_code: "53047",
    },
    {
      name: "Pacific",
      fips_code: "53049",
    },
    {
      name: "Pend Oreille",
      fips_code: "53051",
    },
    {
      name: "Pierce",
      fips_code: "53053",
    },
    {
      name: "San Juan",
      fips_code: "53055",
    },
    {
      name: "Skagit",
      fips_code: "53057",
    },
    {
      name: "Skamania",
      fips_code: "53059",
    },
    {
      name: "Snohomish",
      fips_code: "53061",
    },
    {
      name: "Spokane",
      fips_code: "53063",
    },
    {
      name: "Stevens",
      fips_code: "53065",
    },
    {
      name: "Thurston",
      fips_code: "53067",
    },
    {
      name: "Wahkiakum",
      fips_code: "53069",
    },
    {
      name: "Walla Walla",
      fips_code: "53071",
    },
    {
      name: "Whatcom",
      fips_code: "53073",
    },
    {
      name: "Whitman",
      fips_code: "53075",
    },
    {
      name: "Yakima",
      fips_code: "53077",
    },
  ],
  WV: [
    {
      name: "Barbour",
      fips_code: "54001",
    },
    {
      name: "Berkeley",
      fips_code: "54003",
    },
    {
      name: "Boone",
      fips_code: "54005",
    },
    {
      name: "Braxton",
      fips_code: "54007",
    },
    {
      name: "Brooke",
      fips_code: "54009",
    },
    {
      name: "Cabell",
      fips_code: "54011",
    },
    {
      name: "Calhoun",
      fips_code: "54013",
    },
    {
      name: "Clay",
      fips_code: "54015",
    },
    {
      name: "Doddridge",
      fips_code: "54017",
    },
    {
      name: "Fayette",
      fips_code: "54019",
    },
    {
      name: "G",
      fips_code: "54021",
    },
  ],
  WI: [
    {
      name: "Adams",
      fips_code: "55001",
    },
    {
      name: "Ashland",
      fips_code: "55003",
    },
    {
      name: "Barron",
      fips_code: "55005",
    },
    {
      name: "Bayfield",
      fips_code: "55007",
    },
    {
      name: "Brown",
      fips_code: "55009",
    },
    {
      name: "Buffalo",
      fips_code: "55011",
    },
    {
      name: "Burnett",
      fips_code: "55013",
    },
    {
      name: "Calumet",
      fips_code: "55015",
    },
    {
      name: "Chippewa",
      fips_code: "55017",
    },
    {
      name: "Clark",
      fips_code: "55019",
    },
    {
      name: "Columbia",
      fips_code: "55021",
    },
    {
      name: "Crawford",
      fips_code: "55023",
    },
    {
      name: "Dane",
      fips_code: "55025",
    },
    {
      name: "Dodge",
      fips_code: "55027",
    },
    {
      name: "Door",
      fips_code: "55029",
    },
    {
      name: "Douglas",
      fips_code: "55031",
    },
    {
      name: "Dunn",
      fips_code: "55033",
    },
    {
      name: "Eau Claire",
      fips_code: "55035",
    },
    {
      name: "Florence",
      fips_code: "55037",
    },
    {
      name: "Fond du Lac",
      fips_code: "55039",
    },
    {
      name: "Forest",
      fips_code: "55041",
    },
    {
      name: "Grant",
      fips_code: "55043",
    },
    {
      name: "Green",
      fips_code: "55045",
    },
    {
      name: "Green Lake",
      fips_code: "55047",
    },
    {
      name: "Iowa",
      fips_code: "55049",
    },
    {
      name: "Iron",
      fips_code: "55051",
    },
    {
      name: "Jackson",
      fips_code: "55053",
    },
    {
      name: "Jefferson",
      fips_code: "55055",
    },
    {
      name: "Juneau",
      fips_code: "55057",
    },
    {
      name: "Kenosha",
      fips_code: "55059",
    },
    {
      name: "Kewaunee",
      fips_code: "55061",
    },
    {
      name: "La Crosse",
      fips_code: "55063",
    },
    {
      name: "Lafayette",
      fips_code: "55065",
    },
    {
      name: "Langlade",
      fips_code: "55067",
    },
    {
      name: "Lincoln",
      fips_code: "55069",
    },
    {
      name: "Manitowoc",
      fips_code: "55071",
    },
    {
      name: "Marathon",
      fips_code: "55073",
    },
    {
      name: "Marinette",
      fips_code: "55075",
    },
    {
      name: "Marquette",
      fips_code: "55077",
    },
    {
      name: "Menominee",
      fips_code: "55078",
    },
    {
      name: "Milwaukee",
      fips_code: "55079",
    },
    {
      name: "Monroe",
      fips_code: "55081",
    },
    {
      name: "Oconto",
      fips_code: "55083",
    },
    {
      name: "Oneida",
      fips_code: "55085",
    },
    {
      name: "Outagamie",
      fips_code: "55087",
    },
    {
      name: "Ozaukee",
      fips_code: "55089",
    },
    {
      name: "Pepin",
      fips_code: "55091",
    },
    {
      name: "Pierce",
      fips_code: "55093",
    },
    {
      name: "Polk",
      fips_code: "55095",
    },
    {
      name: "Portage",
      fips_code: "55097",
    },
    {
      name: "Price",
      fips_code: "55099",
    },
    {
      name: "Racine",
      fips_code: "55101",
    },
    {
      name: "Richland",
      fips_code: "55103",
    },
    {
      name: "Rock",
      fips_code: "55105",
    },
    {
      name: "Rusk",
      fips_code: "55107",
    },
    {
      name: "Saint Croix",
      fips_code: "55109",
    },
    {
      name: "Sauk",
      fips_code: "55111",
    },
    {
      name: "Sawyer",
      fips_code: "55113",
    },
    {
      name: "Shawano",
      fips_code: "55115",
    },
    {
      name: "Sheboygan",
      fips_code: "55117",
    },
    {
      name: "Taylor",
      fips_code: "55119",
    },
    {
      name: "Trempealeau",
      fips_code: "55121",
    },
    {
      name: "Vernon",
      fips_code: "55123",
    },
    {
      name: "Vilas",
      fips_code: "55125",
    },
    {
      name: "Walworth",
      fips_code: "55127",
    },
    {
      name: "Washburn",
      fips_code: "55129",
    },
    {
      name: "Washington",
      fips_code: "55131",
    },
    {
      name: "Waukesha",
      fips_code: "55133",
    },
    {
      name: "Waupaca",
      fips_code: "55135",
    },
    {
      name: "Waushara",
      fips_code: "55137",
    },
    {
      name: "Winnebago",
      fips_code: "55139",
    },
    {
      name: "Wood",
      fips_code: "55141",
    },
  ],
  WY: [
    {
      name: "Albany",
      fips_code: "56001",
    },
    {
      name: "Big Horn",
      fips_code: "56003",
    },
    {
      name: "Campbell",
      fips_code: "56005",
    },
    {
      name: "Carbon",
      fips_code: "56007",
    },
    {
      name: "Converse",
      fips_code: "56009",
    },
    {
      name: "Crook",
      fips_code: "56011",
    },
    {
      name: "Fremont",
      fips_code: "56013",
    },
    {
      name: "Goshen",
      fips_code: "56015",
    },
    {
      name: "Hot Springs",
      fips_code: "56017",
    },
    {
      name: "Johnson",
      fips_code: "56019",
    },
    {
      name: "Laramie",
      fips_code: "56021",
    },
    {
      name: "Lincoln",
      fips_code: "56023",
    },
    {
      name: "Natrona",
      fips_code: "56025",
    },
    {
      name: "Niobrara",
      fips_code: "56027",
    },
    {
      name: "Park",
      fips_code: "56029",
    },
    {
      name: "Platte",
      fips_code: "56031",
    },
    {
      name: "Sheridan",
      fips_code: "56033",
    },
    {
      name: "Sublette",
      fips_code: "56035",
    },
    {
      name: "Sweetwater",
      fips_code: "56037",
    },
    {
      name: "Teton",
      fips_code: "56039",
    },
    {
      name: "Uinta",
      fips_code: "56041",
    },
    {
      name: "Washakie",
      fips_code: "56043",
    },
    {
      name: "Weston",
      fips_code: "56045",
    },
  ],
  AL: [
    {
      name: "Autauga",
      fips_code: "01001",
    },
    {
      name: "Baldwin",
      fips_code: "01003",
    },
    {
      name: "Barbour",
      fips_code: "01005",
    },
    {
      name: "Bibb",
      fips_code: "01007",
    },
    {
      name: "Blount",
      fips_code: "01009",
    },
    {
      name: "Bullock",
      fips_code: "01011",
    },
    {
      name: "Butler",
      fips_code: "01013",
    },
    {
      name: "Calhoun",
      fips_code: "01015",
    },
    {
      name: "Chambers",
      fips_code: "01017",
    },
    {
      name: "Cherokee",
      fips_code: "01019",
    },
    {
      name: "Chilton",
      fips_code: "01021",
    },
    {
      name: "Choctaw",
      fips_code: "01023",
    },
    {
      name: "Clarke",
      fips_code: "01025",
    },
    {
      name: "Clay",
      fips_code: "01027",
    },
    {
      name: "Cleburne",
      fips_code: "01029",
    },
    {
      name: "Coffee",
      fips_code: "01031",
    },
    {
      name: "Colbert",
      fips_code: "01033",
    },
    {
      name: "Conecuh",
      fips_code: "01035",
    },
    {
      name: "Coosa",
      fips_code: "01037",
    },
    {
      name: "Covington",
      fips_code: "01039",
    },
    {
      name: "Crenshaw",
      fips_code: "01041",
    },
    {
      name: "Cullman",
      fips_code: "01043",
    },
    {
      name: "Dale",
      fips_code: "01045",
    },
    {
      name: "Dallas",
      fips_code: "01047",
    },
    {
      name: "DeKalb",
      fips_code: "01049",
    },
    {
      name: "Elmore",
      fips_code: "01051",
    },
    {
      name: "Escambia",
      fips_code: "01053",
    },
    {
      name: "Etowah",
      fips_code: "01055",
    },
    {
      name: "Fayette",
      fips_code: "01057",
    },
    {
      name: "Franklin",
      fips_code: "01059",
    },
    {
      name: "Geneva",
      fips_code: "01061",
    },
    {
      name: "Greene",
      fips_code: "01063",
    },
    {
      name: "Hale",
      fips_code: "01065",
    },
    {
      name: "Henry",
      fips_code: "01067",
    },
    {
      name: "Houston",
      fips_code: "01069",
    },
    {
      name: "Jackson",
      fips_code: "01071",
    },
    {
      name: "Jefferson",
      fips_code: "01073",
    },
    {
      name: "Lamar",
      fips_code: "01075",
    },
    {
      name: "Lauderdale",
      fips_code: "01077",
    },
    {
      name: "Lawrence",
      fips_code: "01079",
    },
    {
      name: "Lee",
      fips_code: "01081",
    },
    {
      name: "Limestone",
      fips_code: "01083",
    },
    {
      name: "Lowndes",
      fips_code: "01085",
    },
    {
      name: "Macon",
      fips_code: "01087",
    },
    {
      name: "Madison",
      fips_code: "01089",
    },
    {
      name: "Marengo",
      fips_code: "01091",
    },
    {
      name: "Marion",
      fips_code: "01093",
    },
    {
      name: "Marshall",
      fips_code: "01095",
    },
    {
      name: "Mobile",
      fips_code: "01097",
    },
    {
      name: "Monroe",
      fips_code: "01099",
    },
    {
      name: "Montgomery",
      fips_code: "01101",
    },
    {
      name: "Morgan",
      fips_code: "01103",
    },
    {
      name: "Perry",
      fips_code: "01105",
    },
    {
      name: "Pickens",
      fips_code: "01107",
    },
    {
      name: "Pike",
      fips_code: "01109",
    },
    {
      name: "Randolph",
      fips_code: "01111",
    },
    {
      name: "Russell",
      fips_code: "01113",
    },
    {
      name: "Shelby",
      fips_code: "01117",
    },
    {
      name: "St. Clair",
      fips_code: "01115",
    },
    {
      name: "Sumter",
      fips_code: "01119",
    },
    {
      name: "Talladega",
      fips_code: "01121",
    },
    {
      name: "Tallapoosa",
      fips_code: "01123",
    },
    {
      name: "Tuscaloosa",
      fips_code: "01125",
    },
    {
      name: "Walker",
      fips_code: "01127",
    },
    {
      name: "Washington",
      fips_code: "01129",
    },
    {
      name: "Wilcox",
      fips_code: "01131",
    },
    {
      name: "Winston",
      fips_code: "01133",
    },
  ],
  AK: [
    {
      name: "Aleutians East",
      fips_code: "02013",
    },
    {
      name: "Aleutians West",
      fips_code: "02016",
    },
    {
      name: "Anchorage",
      fips_code: "02020",
    },
    {
      name: "Bethel",
      fips_code: "02050",
    },
    {
      name: "Bristol Bay",
      fips_code: "02060",
    },
    {
      name: "Denali",
      fips_code: "02068",
    },
    {
      name: "Dillingham",
      fips_code: "02070",
    },
    {
      name: "Fairbanks North Star",
      fips_code: "02090",
    },
    {
      name: "Haines",
      fips_code: "02100",
    },
    {
      name: "Juneau",
      fips_code: "02110",
    },
    {
      name: "Kenai Peninsula",
      fips_code: "02122",
    },
    {
      name: "Ketchikan Gateway",
      fips_code: "02130",
    },
    {
      name: "Kodiak Island",
      fips_code: "02150",
    },
    {
      name: "Lake and Peninsula",
      fips_code: "02164",
    },
    {
      name: "Matanuska-Susitna",
      fips_code: "02170",
    },
    {
      name: "Nome",
      fips_code: "02180",
    },
    {
      name: "North Slope",
      fips_code: "02185",
    },
    {
      name: "Northwest Arctic",
      fips_code: "02188",
    },
    {
      name: "Prince of Wales-Outer Ketchikan",
      fips_code: "02201",
    },
    {
      name: "Sitka",
      fips_code: "02220",
    },
    {
      name: "Skagway-Hoonah-Angoon",
      fips_code: "02232",
    },
    {
      name: "Skagway-Yakutat-Angoon",
      fips_code: "02231",
    },
    {
      name: "Southeast Fairbanks",
      fips_code: "02240",
    },
    {
      name: "Valdez-Cordova",
      fips_code: "02261",
    },
    {
      name: "Wade Hampton",
      fips_code: "02270",
    },
    {
      name: "Wrangell-Petersburg",
      fips_code: "02280",
    },
    {
      name: "Yakutat",
      fips_code: "02282",
    },
    {
      name: "Yukon-Koyukuk",
      fips_code: "02290",
    },
  ],
  AZ: [
    {
      name: "Apache",
      fips_code: "04001",
    },
    {
      name: "Cochise",
      fips_code: "04003",
    },
    {
      name: "Coconino",
      fips_code: "04005",
    },
    {
      name: "Gila",
      fips_code: "04007",
    },
    {
      name: "Graham",
      fips_code: "04009",
    },
    {
      name: "Greenlee",
      fips_code: "04011",
    },
    {
      name: "La Paz",
      fips_code: "04012",
    },
    {
      name: "Maricopa",
      fips_code: "04013",
    },
    {
      name: "Mohave",
      fips_code: "04015",
    },
    {
      name: "Navajo",
      fips_code: "04017",
    },
    {
      name: "Pima",
      fips_code: "04019",
    },
    {
      name: "Pinal",
      fips_code: "04021",
    },
    {
      name: "Santa Cruz",
      fips_code: "04023",
    },
    {
      name: "Yavapai",
      fips_code: "04025",
    },
    {
      name: "Yuma",
      fips_code: "04027",
    },
  ],
  AR: [
    {
      name: "Arkansas",
      fips_code: "05001",
    },
    {
      name: "Ashley",
      fips_code: "05003",
    },
    {
      name: "Baxter",
      fips_code: "05005",
    },
    {
      name: "Benton",
      fips_code: "05007",
    },
    {
      name: "Boone",
      fips_code: "05009",
    },
    {
      name: "Bradley",
      fips_code: "05011",
    },
    {
      name: "Calhoun",
      fips_code: "05013",
    },
    {
      name: "Carroll",
      fips_code: "05015",
    },
    {
      name: "Chicot",
      fips_code: "05017",
    },
    {
      name: "Clark",
      fips_code: "05019",
    },
    {
      name: "Clay",
      fips_code: "05021",
    },
    {
      name: "Cleburne",
      fips_code: "05023",
    },
    {
      name: "Cleveland",
      fips_code: "05025",
    },
    {
      name: "Columbia",
      fips_code: "05027",
    },
    {
      name: "Conway",
      fips_code: "05029",
    },
    {
      name: "Craighead",
      fips_code: "05031",
    },
    {
      name: "Crawford",
      fips_code: "05033",
    },
    {
      name: "Crittenden",
      fips_code: "05035",
    },
    {
      name: "Cross",
      fips_code: "05037",
    },
    {
      name: "Dallas",
      fips_code: "05039",
    },
    {
      name: "Desha",
      fips_code: "05041",
    },
    {
      name: "Drew",
      fips_code: "05043",
    },
    {
      name: "Faulkner",
      fips_code: "05045",
    },
    {
      name: "Franklin",
      fips_code: "05047",
    },
    {
      name: "Fulton",
      fips_code: "05049",
    },
    {
      name: "Garland",
      fips_code: "05051",
    },
    {
      name: "Grant",
      fips_code: "05053",
    },
    {
      name: "Greene",
      fips_code: "05055",
    },
    {
      name: "Hempstead",
      fips_code: "05057",
    },
    {
      name: "Hot Spring",
      fips_code: "05059",
    },
    {
      name: "Howard",
      fips_code: "05061",
    },
    {
      name: "Independence",
      fips_code: "05063",
    },
    {
      name: "Izard",
      fips_code: "05065",
    },
    {
      name: "Jackson",
      fips_code: "05067",
    },
    {
      name: "Jefferson",
      fips_code: "05069",
    },
    {
      name: "Johnson",
      fips_code: "05071",
    },
    {
      name: "Lafayette",
      fips_code: "05073",
    },
    {
      name: "Lawrence",
      fips_code: "05075",
    },
    {
      name: "Lee",
      fips_code: "05077",
    },
    {
      name: "Lincoln",
      fips_code: "05079",
    },
    {
      name: "Little River",
      fips_code: "05081",
    },
    {
      name: "Logan",
      fips_code: "05083",
    },
    {
      name: "Lonoke",
      fips_code: "05085",
    },
    {
      name: "Madison",
      fips_code: "05087",
    },
    {
      name: "Marion",
      fips_code: "05089",
    },
    {
      name: "Miller",
      fips_code: "05091",
    },
    {
      name: "Mississippi",
      fips_code: "05093",
    },
    {
      name: "Monroe",
      fips_code: "05095",
    },
    {
      name: "Montgomery",
      fips_code: "05097",
    },
    {
      name: "Nevada",
      fips_code: "05099",
    },
    {
      name: "Newton",
      fips_code: "05101",
    },
    {
      name: "Ouachita",
      fips_code: "05103",
    },
    {
      name: "Perry",
      fips_code: "05105",
    },
    {
      name: "Phillips",
      fips_code: "05107",
    },
    {
      name: "Pike",
      fips_code: "05109",
    },
    {
      name: "Poinsett",
      fips_code: "05111",
    },
    {
      name: "Polk",
      fips_code: "05113",
    },
    {
      name: "Pope",
      fips_code: "05115",
    },
    {
      name: "Prairie",
      fips_code: "05117",
    },
    {
      name: "Pulaski",
      fips_code: "05119",
    },
    {
      name: "Randolph",
      fips_code: "05121",
    },
    {
      name: "Saline",
      fips_code: "05125",
    },
    {
      name: "Scott",
      fips_code: "05127",
    },
    {
      name: "Searcy",
      fips_code: "05129",
    },
    {
      name: "Sebastian",
      fips_code: "05131",
    },
    {
      name: "Sevier",
      fips_code: "05133",
    },
    {
      name: "Sharp",
      fips_code: "05135",
    },
    {
      name: "St. Francis",
      fips_code: "05123",
    },
    {
      name: "Stone",
      fips_code: "05137",
    },
    {
      name: "Union",
      fips_code: "05139",
    },
    {
      name: "Van Buren",
      fips_code: "05141",
    },
    {
      name: "Washington",
      fips_code: "05143",
    },
    {
      name: "White",
      fips_code: "05145",
    },
    {
      name: "Woodruff",
      fips_code: "05147",
    },
    {
      name: "Yell",
      fips_code: "05149",
    },
  ],
  CA: [
    {
      name: "Alameda",
      fips_code: "06001",
    },
    {
      name: "Alpine",
      fips_code: "06003",
    },
    {
      name: "Amador",
      fips_code: "06005",
    },
    {
      name: "Butte",
      fips_code: "06007",
    },
    {
      name: "Calaveras",
      fips_code: "06009",
    },
    {
      name: "Colusa",
      fips_code: "06011",
    },
    {
      name: "Contra Costa",
      fips_code: "06013",
    },
    {
      name: "Del Norte",
      fips_code: "06015",
    },
    {
      name: "El Dorado",
      fips_code: "06017",
    },
    {
      name: "Fresno",
      fips_code: "06019",
    },
    {
      name: "Glenn",
      fips_code: "06021",
    },
    {
      name: "Humboldt",
      fips_code: "06023",
    },
    {
      name: "Imperial",
      fips_code: "06025",
    },
    {
      name: "Inyo",
      fips_code: "06027",
    },
    {
      name: "Kern",
      fips_code: "06029",
    },
    {
      name: "Kings",
      fips_code: "06031",
    },
    {
      name: "Lake",
      fips_code: "06033",
    },
    {
      name: "Lassen",
      fips_code: "06035",
    },
    {
      name: "Los Angeles",
      fips_code: "06037",
    },
    {
      name: "Madera",
      fips_code: "06039",
    },
    {
      name: "Marin",
      fips_code: "06041",
    },
    {
      name: "Mariposa",
      fips_code: "06043",
    },
    {
      name: "Mendocino",
      fips_code: "06045",
    },
    {
      name: "Merced",
      fips_code: "06047",
    },
    {
      name: "Modoc",
      fips_code: "06049",
    },
    {
      name: "Mono",
      fips_code: "06051",
    },
    {
      name: "Monterey",
      fips_code: "06053",
    },
    {
      name: "Napa",
      fips_code: "06055",
    },
    {
      name: "Nevada",
      fips_code: "06057",
    },
    {
      name: "Orange",
      fips_code: "06059",
    },
    {
      name: "Placer",
      fips_code: "06061",
    },
    {
      name: "Plumas",
      fips_code: "06063",
    },
    {
      name: "Riverside",
      fips_code: "06065",
    },
    {
      name: "Sacramento",
      fips_code: "06067",
    },
    {
      name: "San Benito",
      fips_code: "06069",
    },
    {
      name: "San Bernardino",
      fips_code: "06071",
    },
    {
      name: "San Diego",
      fips_code: "06073",
    },
    {
      name: "San Francisco",
      fips_code: "06075",
    },
    {
      name: "San Joaquin",
      fips_code: "06077",
    },
    {
      name: "San Luis Obispo",
      fips_code: "06079",
    },
    {
      name: "San Mateo",
      fips_code: "06081",
    },
    {
      name: "Santa Barbara",
      fips_code: "06083",
    },
    {
      name: "Santa Clara",
      fips_code: "06085",
    },
    {
      name: "Santa Cruz",
      fips_code: "06087",
    },
    {
      name: "Shasta",
      fips_code: "06089",
    },
    {
      name: "Sierra",
      fips_code: "06091",
    },
    {
      name: "Siskiyou",
      fips_code: "06093",
    },
    {
      name: "Solano",
      fips_code: "06095",
    },
    {
      name: "Sonoma",
      fips_code: "06097",
    },
    {
      name: "Stanislaus",
      fips_code: "06099",
    },
    {
      name: "Sutter",
      fips_code: "06101",
    },
    {
      name: "Tehama",
      fips_code: "06103",
    },
    {
      name: "Trinity",
      fips_code: "06105",
    },
    {
      name: "Tulare",
      fips_code: "06107",
    },
    {
      name: "Tuolumne",
      fips_code: "06109",
    },
    {
      name: "Ventura",
      fips_code: "06111",
    },
    {
      name: "Yolo",
      fips_code: "06113",
    },
    {
      name: "Yuba",
      fips_code: "06115",
    },
  ],
  CO: [
    {
      name: "Adams",
      fips_code: "08001",
    },
    {
      name: "Alamosa",
      fips_code: "08003",
    },
    {
      name: "Arapahoe",
      fips_code: "08005",
    },
    {
      name: "Archuleta",
      fips_code: "08007",
    },
    {
      name: "Baca",
      fips_code: "08009",
    },
    {
      name: "Bent",
      fips_code: "08011",
    },
    {
      name: "Boulder",
      fips_code: "08013",
    },
    {
      name: "Chaffee",
      fips_code: "08015",
    },
    {
      name: "Cheyenne",
      fips_code: "08017",
    },
    {
      name: "Clear Creek",
      fips_code: "08019",
    },
    {
      name: "Conejos",
      fips_code: "08021",
    },
    {
      name: "Costilla",
      fips_code: "08023",
    },
    {
      name: "Crowley",
      fips_code: "08025",
    },
    {
      name: "Custer",
      fips_code: "08027",
    },
    {
      name: "Delta",
      fips_code: "08029",
    },
    {
      name: "Denver",
      fips_code: "08031",
    },
    {
      name: "Dolores",
      fips_code: "08033",
    },
    {
      name: "Douglas",
      fips_code: "08035",
    },
    {
      name: "Eagle",
      fips_code: "08037",
    },
    {
      name: "El Paso",
      fips_code: "08041",
    },
    {
      name: "Elbert",
      fips_code: "08039",
    },
    {
      name: "Fremont",
      fips_code: "08043",
    },
    {
      name: "Garfield",
      fips_code: "08045",
    },
    {
      name: "Gilpin",
      fips_code: "08047",
    },
    {
      name: "Grand",
      fips_code: "08049",
    },
    {
      name: "Gunnison",
      fips_code: "08051",
    },
    {
      name: "Hinsdale",
      fips_code: "08053",
    },
    {
      name: "Huerfano",
      fips_code: "08055",
    },
    {
      name: "Jackson",
      fips_code: "08057",
    },
    {
      name: "Jefferson",
      fips_code: "08059",
    },
    {
      name: "Kiowa",
      fips_code: "08061",
    },
    {
      name: "Kit Carson",
      fips_code: "08063",
    },
    {
      name: "La Plata",
      fips_code: "08067",
    },
    {
      name: "Lake",
      fips_code: "08065",
    },
    {
      name: "Larimer",
      fips_code: "08069",
    },
    {
      name: "Las Animas",
      fips_code: "08071",
    },
    {
      name: "Lincoln",
      fips_code: "08073",
    },
    {
      name: "Logan",
      fips_code: "08075",
    },
    {
      name: "Mesa",
      fips_code: "08077",
    },
    {
      name: "Mineral",
      fips_code: "08079",
    },
    {
      name: "Moffat",
      fips_code: "08081",
    },
    {
      name: "Montezuma",
      fips_code: "08083",
    },
    {
      name: "Montrose",
      fips_code: "08085",
    },
    {
      name: "Morgan",
      fips_code: "08087",
    },
    {
      name: "Otero",
      fips_code: "08089",
    },
    {
      name: "Ouray",
      fips_code: "08091",
    },
    {
      name: "Park",
      fips_code: "08093",
    },
    {
      name: "Phillips",
      fips_code: "08095",
    },
    {
      name: "Pitkin",
      fips_code: "08097",
    },
    {
      name: "Prowers",
      fips_code: "08099",
    },
    {
      name: "Pueblo",
      fips_code: "08101",
    },
    {
      name: "Rio Blanco",
      fips_code: "08103",
    },
    {
      name: "Rio Grande",
      fips_code: "08105",
    },
    {
      name: "Routt",
      fips_code: "08107",
    },
    {
      name: "Saguache",
      fips_code: "08109",
    },
    {
      name: "San Juan",
      fips_code: "08111",
    },
    {
      name: "San Miguel",
      fips_code: "08113",
    },
    {
      name: "Sedgwick",
      fips_code: "08115",
    },
    {
      name: "Summit",
      fips_code: "08117",
    },
    {
      name: "Teller",
      fips_code: "08119",
    },
    {
      name: "Washington",
      fips_code: "08121",
    },
    {
      name: "Weld",
      fips_code: "08123",
    },
    {
      name: "Yuma",
      fips_code: "08125",
    },
  ],
  CT: [
    {
      name: "Fairfield",
      fips_code: "09001",
    },
    {
      name: "Hartford",
      fips_code: "09003",
    },
    {
      name: "Litchfield",
      fips_code: "09005",
    },
    {
      name: "Middlesex",
      fips_code: "09007",
    },
    {
      name: "New Haven",
      fips_code: "09009",
    },
    {
      name: "New London",
      fips_code: "09011",
    },
    {
      name: "Tolland",
      fips_code: "09013",
    },
    {
      name: "Windham",
      fips_code: "09015",
    },
  ],
};

/**
 * Get counties for a specific state
 * @param stateCode - Two-letter state code (e.g., "GA", "TX")
 * @returns Array of counties for that state
 */
export function getCountiesForState(stateCode: string): CountyData[] {
  return usCountiesByState[stateCode.toUpperCase()] || [];
}

/**
 * State code to name mapping
 */
export const stateCodeToName: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/**
 * Get all state codes that have county data
 */
export function getStatesWithCountyData(): string[] {
  return Object.keys(usCountiesByState).sort();
}
