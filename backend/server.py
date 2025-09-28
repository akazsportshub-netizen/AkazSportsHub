from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Akaz Sports Hub API", description="Professional Sports Equipment B2B Platform", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Enums for product categories
class Brand(str, Enum):
    GOWIN = "GOWIN"
    TRIUMPH = "TRIUMPH" 
    BABBLER = "BABBLER"
    CAPTAIN = "CAPTAIN"

class Category(str, Enum):
    # GOWIN Categories
    CRICKET_SHOES = "Cricket Shoes"
    FOOTBALL_SHOES = "Football Shoes"
    BADMINTON_SHOES = "Badminton Shoes"
    RUNNING_SHOES = "Running Shoes"
    FOOTWEAR_ACCESSORIES = "Footwear Accessories"
    
    # TRIUMPH Categories
    CRICKET_BAGS = "Cricket Bags"
    CRICKET_ACCESSORIES = "Cricket Accessories"
    BADMINTON_EQUIPMENT = "Badminton Equipment"
    SPORTS_BAGS = "Sports Bags"
    GENERAL_ACCESSORIES = "General Accessories"
    
    # BABBLER Categories
    GYM_GLOVES = "Gym Gloves"
    GYM_BELTS = "Gym Belts"
    SUPPORT_GEAR = "Support Gear"
    BOXING_EQUIPMENT = "Boxing Equipment"
    FITNESS_ACCESSORIES = "Fitness Accessories"

class InquiryStatus(str, Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    QUOTED = "quoted"
    CLOSED = "closed"

# Data Models
class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    brand: Brand
    category: Category
    model_code: str
    description: Optional[str] = ""
    specifications: Dict[str, Any] = Field(default_factory=dict)
    features: List[str] = Field(default_factory=list)
    colors: List[str] = Field(default_factory=list)
    sizes: List[str] = Field(default_factory=list)
    images: List[str] = Field(default_factory=list)
    price_range: Optional[str] = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProductCreate(BaseModel):
    name: str
    brand: Brand
    category: Category
    model_code: str
    description: Optional[str] = ""
    specifications: Dict[str, Any] = Field(default_factory=dict)
    features: List[str] = Field(default_factory=list)
    colors: List[str] = Field(default_factory=list)
    sizes: List[str] = Field(default_factory=list)
    images: List[str] = Field(default_factory=list)
    price_range: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    specifications: Optional[Dict[str, Any]] = None
    features: Optional[List[str]] = None
    colors: Optional[List[str]] = None
    sizes: Optional[List[str]] = None
    images: Optional[List[str]] = None
    price_range: Optional[str] = None
    is_active: Optional[bool] = None

class Inquiry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_name: str
    contact_person: str
    email: str
    phone: str
    country: str
    message: str
    products_interested: List[str] = Field(default_factory=list)  # Product IDs
    inquiry_type: str = "general"  # general, bulk_order, quotation
    status: InquiryStatus = InquiryStatus.PENDING
    admin_notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class InquiryCreate(BaseModel):
    company_name: str
    contact_person: str
    email: str
    phone: str
    country: str
    message: str
    products_interested: List[str] = Field(default_factory=list)
    inquiry_type: str = "general"

class InquiryUpdate(BaseModel):
    status: Optional[InquiryStatus] = None
    admin_notes: Optional[str] = None

class NewsletterSubscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    company_name: Optional[str] = ""
    subscribed_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class NewsletterCreate(BaseModel):
    email: str
    company_name: Optional[str] = ""

# Routes
@api_router.get("/")
async def root():
    return {
        "message": "Welcome to Akaz Sports Hub API",
        "company": "Akaz Sports Hub",
        "description": "Your trusted partner for premium sports equipment in GCC region",
        "brands": ["GOWIN", "TRIUMPH", "BABBLER"],
        "version": "1.0.0"
    }

@api_router.get("/brands")
async def get_brands():
    """Get all available brands with their categories"""
    return {
        "GOWIN": {
            "name": "GOWIN",
            "description": "Premium Sports Footwear",
            "categories": ["Cricket Shoes", "Football Shoes", "Badminton Shoes", "Running Shoes", "Footwear Accessories"],
            "logo": "/images/brands/gowin-logo.png"
        },
        "TRIUMPH": {
            "name": "TRIUMPH",
            "description": "Complete Sports Equipment & Bags",
            "categories": ["Cricket Bags", "Cricket Accessories", "Badminton Equipment", "Sports Bags", "General Accessories"],
            "logo": "/images/brands/triumph-logo.png"
        },
        "BABBLER": {
            "name": "BABBLER",
            "description": "Professional Fitness & Athletic Gear",
            "categories": ["Gym Gloves", "Gym Belts", "Support Gear", "Boxing Equipment", "Fitness Accessories"],
            "logo": "/images/brands/babbler-logo.png"
        }
    }

@api_router.get("/categories")
async def get_categories(brand: Optional[Brand] = None):
    """Get all categories, optionally filtered by brand"""
    all_categories = {
        "GOWIN": ["Cricket Shoes", "Football Shoes", "Badminton Shoes", "Running Shoes", "Footwear Accessories"],
        "TRIUMPH": ["Cricket Bags", "Cricket Accessories", "Badminton Equipment", "Sports Bags", "General Accessories"],
        "BABBLER": ["Gym Gloves", "Gym Belts", "Support Gear", "Boxing Equipment", "Fitness Accessories"]
    }
    
    if brand:
        return {brand.value: all_categories.get(brand.value, [])}
    return all_categories

# Product Management
@api_router.post("/products", response_model=Product)
async def create_product(product: ProductCreate):
    """Create a new product (Admin only)"""
    product_dict = product.dict()
    product_obj = Product(**product_dict)
    
    # Insert into database
    await db.products.insert_one(product_obj.dict())
    return product_obj

@api_router.get("/products", response_model=List[Product])
async def get_products(
    brand: Optional[Brand] = None,
    category: Optional[Category] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    is_active: bool = True
):
    """Get products with filtering and pagination"""
    filter_query = {"is_active": is_active}
    
    if brand:
        filter_query["brand"] = brand.value
    if category:
        filter_query["category"] = category.value
    if search:
        filter_query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"model_code": {"$regex": search, "$options": "i"}}
        ]
    
    products = await db.products.find(filter_query).skip(skip).limit(limit).to_list(limit)
    return [Product(**product) for product in products]

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    """Get a specific product by ID"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return Product(**product)

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_update: ProductUpdate):
    """Update a product (Admin only)"""
    update_data = {k: v for k, v in product_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    result = await db.products.update_one(
        {"id": product_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    updated_product = await db.products.find_one({"id": product_id})
    return Product(**updated_product)

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    """Delete a product (Admin only)"""
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted successfully"}

# Inquiry Management
@api_router.post("/inquiries", response_model=Inquiry)
async def create_inquiry(inquiry: InquiryCreate):
    """Create a new B2B inquiry"""
    inquiry_dict = inquiry.dict()
    inquiry_obj = Inquiry(**inquiry_dict)
    
    await db.inquiries.insert_one(inquiry_obj.dict())
    return inquiry_obj

@api_router.get("/inquiries", response_model=List[Inquiry])
async def get_inquiries(
    status: Optional[InquiryStatus] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    """Get all inquiries (Admin only)"""
    filter_query = {}
    if status:
        filter_query["status"] = status.value
    
    inquiries = await db.inquiries.find(filter_query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [Inquiry(**inquiry) for inquiry in inquiries]

@api_router.get("/inquiries/{inquiry_id}", response_model=Inquiry)
async def get_inquiry(inquiry_id: str):
    """Get a specific inquiry (Admin only)"""
    inquiry = await db.inquiries.find_one({"id": inquiry_id})
    if not inquiry:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    return Inquiry(**inquiry)

@api_router.put("/inquiries/{inquiry_id}", response_model=Inquiry)
async def update_inquiry(inquiry_id: str, inquiry_update: InquiryUpdate):
    """Update inquiry status (Admin only)"""
    update_data = {k: v for k, v in inquiry_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    result = await db.inquiries.update_one(
        {"id": inquiry_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    
    updated_inquiry = await db.inquiries.find_one({"id": inquiry_id})
    return Inquiry(**updated_inquiry)

# Newsletter Subscription
@api_router.post("/newsletter", response_model=NewsletterSubscription)
async def subscribe_newsletter(subscription: NewsletterCreate):
    """Subscribe to newsletter"""
    # Check if email already exists
    existing = await db.newsletter_subscriptions.find_one({"email": subscription.email})
    if existing:
        if existing["is_active"]:
            raise HTTPException(status_code=400, detail="Email already subscribed")
        else:
            # Reactivate subscription
            await db.newsletter_subscriptions.update_one(
                {"email": subscription.email},
                {"$set": {"is_active": True, "subscribed_at": datetime.utcnow()}}
            )
            updated_sub = await db.newsletter_subscriptions.find_one({"email": subscription.email})
            return NewsletterSubscription(**updated_sub)
    
    subscription_dict = subscription.dict()
    subscription_obj = NewsletterSubscription(**subscription_dict)
    
    await db.newsletter_subscriptions.insert_one(subscription_obj.dict())
    return subscription_obj

@api_router.get("/newsletter")
async def get_newsletter_subscriptions():
    """Get all newsletter subscriptions (Admin only)"""
    subscriptions = await db.newsletter_subscriptions.find({"is_active": True}).to_list(1000)
    return [NewsletterSubscription(**sub) for sub in subscriptions]

# Analytics and Stats
@api_router.get("/stats")
async def get_stats():
    """Get website statistics (Admin only)"""
    total_products = await db.products.count_documents({"is_active": True})
    total_inquiries = await db.inquiries.count_documents({})
    pending_inquiries = await db.inquiries.count_documents({"status": "pending"})
    newsletter_subscribers = await db.newsletter_subscriptions.count_documents({"is_active": True})
    
    # Products by brand
    products_by_brand = {}
    for brand in Brand:
        count = await db.products.count_documents({"brand": brand.value, "is_active": True})
        products_by_brand[brand.value] = count
    
    return {
        "total_products": total_products,
        "total_inquiries": total_inquiries,
        "pending_inquiries": pending_inquiries,
        "newsletter_subscribers": newsletter_subscribers,
        "products_by_brand": products_by_brand
    }

@api_router.get("/featured-products", response_model=List[Product])
async def get_featured_products(limit: int = Query(8, ge=1, le=20)):
    """Get featured products for homepage"""
    # Get a mix of products from different brands
    featured_products = []
    
    for brand in Brand:
        brand_products = await db.products.find({
            "brand": brand.value, 
            "is_active": True
        }).limit(3).to_list(3)
        featured_products.extend(brand_products)
    
    # If we don't have enough, get more random products
    if len(featured_products) < limit:
        additional = await db.products.find({"is_active": True}).limit(limit - len(featured_products)).to_list(limit)
        featured_products.extend(additional)
    
    return [Product(**product) for product in featured_products[:limit]]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()